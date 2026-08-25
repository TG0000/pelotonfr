/**
 * Venue resolution.
 *
 * A venue is a physical place where races happen. Because the same town hosts
 * the same event year after year — and often several races on the same day —
 * venues are deduplicated on rounded coordinates and geocoded ONCE. That turns
 * geocoding from a per-race cost (thousands of calls, re-run on every scrape)
 * into a per-place cost that converges to zero.
 *
 * Two entry paths, because the sources are asymmetric:
 *   - FFC gives municipality coordinates but no city name  → reverse geocode.
 *   - cyclisme-amateur gives a town name but no coordinates → forward geocode.
 *
 * Bulk reverse geocoding uses the BAN CSV endpoint, which resolves thousands of
 * points in a single request instead of one HTTP call per point.
 */

import type { SqlFn } from "./db";

/** ~11 m of precision: enough to separate neighbouring communes, coarse
 *  enough that the same commune always collapses to one row. */
const GEO_KEY_PRECISION = 4;

const BAN_BASE = "https://api-adresse.data.gouv.fr";
const GEO_API_BASE = "https://geo.api.gouv.fr";
const USER_AGENT = "PelotonFR/2.0 (+https://pelotonfr.fr; contact@pelotonfr.fr)";

export function geoKey(lat: number, lng: number): string {
  return `${lat.toFixed(GEO_KEY_PRECISION)},${lng.toFixed(GEO_KEY_PRECISION)}`;
}

/** Normalises a place name for comparison: no accents, no case, no noise. */
export function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Extracts a department code from a BAN `context` field: "01, Ain, ...". */
function deptFromContext(context: string | undefined): {
  code?: string;
  name?: string;
  region?: string;
} {
  if (!context) return {};
  const parts = context.split(",").map((p) => p.trim());
  return {
    code: parts[0] || undefined,
    name: parts[1] || undefined,
    region: parts[2] || undefined,
  };
}

export interface VenueHints {
  city?: string;
  departmentCode?: string;
  departmentName?: string;
  postcode?: string;
}

/**
 * Returns the venue id for a coordinate pair, creating the row if needed.
 * The row starts unresolved (no city); `resolveVenueNames` fills it in later.
 */
export async function getOrCreateVenueFromCoords(
  sql: SqlFn,
  lat: number,
  lng: number,
  hints: VenueHints = {},
  cache?: Map<string, string>
): Promise<string> {
  const key = geoKey(lat, lng);
  const cached = cache?.get(key);
  if (cached) return cached;

  const rows = await sql(
    `INSERT INTO venues (geo_key, location, city, normalized_city, department_code, department_name, postcode, geo_source, geo_precision)
     VALUES ($1::varchar,
             ST_MakePoint($2::float8, $3::float8)::geography,
             $4::varchar, $5::varchar, $6::varchar, $7::varchar, $8::varchar,
             'ffc_marker',
             CASE WHEN $4::varchar IS NULL THEN 'unknown' ELSE 'municipality' END)
     ON CONFLICT (geo_key) DO UPDATE SET
       department_code = COALESCE(venues.department_code, EXCLUDED.department_code),
       department_name = COALESCE(venues.department_name, EXCLUDED.department_name)
     RETURNING id`,
    [
      key,
      lng,
      lat,
      hints.city ?? null,
      hints.city ? normalizePlace(hints.city) : null,
      hints.departmentCode ?? null,
      hints.departmentName ?? null,
      hints.postcode ?? null,
    ]
  );

  const id = rows[0].id as string;
  cache?.set(key, id);
  return id;
}

/**
 * Returns the venue id for a place known only by name.
 * Looks for an already-geocoded venue with that city first, so repeated towns
 * cost nothing; otherwise forward-geocodes through the BAN.
 */
export async function getOrCreateVenueFromCity(
  sql: SqlFn,
  city: string,
  hints: VenueHints = {},
  cache?: Map<string, string>
): Promise<string | null> {
  const normalized = normalizePlace(city);
  if (!normalized) return null;

  const cacheKey = `name:${normalized}:${hints.departmentCode ?? ""}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;

  // 1. Already known?
  const existing = await sql(
    `SELECT id FROM venues
     WHERE normalized_city = $1
       AND ($2::text IS NULL OR department_code = $2 OR department_code IS NULL)
     LIMIT 1`,
    [normalized, hints.departmentCode ?? null]
  );

  if (existing.length > 0) {
    const id = existing[0].id as string;
    cache?.set(cacheKey, id);
    return id;
  }

  // 2. Forward geocode.
  const params = new URLSearchParams({ q: city, type: "municipality", limit: "1" });
  if (hints.postcode) params.set("postcode", hints.postcode);

  let feature: BanFeature | null = null;
  try {
    const res = await fetch(`${BAN_BASE}/search/?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = (await res.json()) as BanFeatureCollection;
      const candidate = json.features?.[0];
      if (candidate && candidate.properties.score >= 0.4) feature = candidate;
    }
  } catch {
    // Network hiccup — leave unresolved, the next run retries.
  }

  if (!feature) return null;

  const [lng, lat] = feature.geometry.coordinates;
  const ctx = deptFromContext(feature.properties.context);

  const id = await getOrCreateVenueFromCoords(
    sql,
    lat,
    lng,
    {
      city: feature.properties.city ?? feature.properties.name,
      departmentCode: ctx.code ?? hints.departmentCode,
      departmentName: ctx.name ?? hints.departmentName,
      postcode: feature.properties.postcode ?? hints.postcode,
    },
    cache
  );

  const resolvedCity = feature.properties.city ?? feature.properties.name ?? null;

  await sql(
    `UPDATE venues
       SET city = COALESCE($2, city),
           normalized_city = COALESCE($3, normalized_city),
           insee_code = COALESCE($4, insee_code),
           postcode = COALESCE($5, postcode),
           department_code = COALESCE($6, department_code),
           department_name = COALESCE($7, department_name),
           region = COALESCE($8, region),
           geo_source = 'ban_forward',
           geo_precision = 'municipality',
           resolved_at = now()
     WHERE id = $1`,
    [
      id,
      resolvedCity,
      resolvedCity ? normalizePlace(resolvedCity) : null,
      feature.properties.citycode ?? null,
      feature.properties.postcode ?? null,
      ctx.code ?? null,
      ctx.name ?? null,
      ctx.region ?? null,
    ]
  );

  cache?.set(cacheKey, id);
  return id;
}

interface BanFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    score: number;
    city?: string;
    name?: string;
    postcode?: string;
    citycode?: string;
    context?: string;
  };
}
interface BanFeatureCollection {
  features?: BanFeature[];
}

/**
 * Resolves a point to its commune using the government's administrative
 * boundaries (point-in-polygon), which — unlike address-based reverse
 * geocoding — always answers for a point inside France.
 */
async function communeFromPoint(
  lat: number,
  lng: number
): Promise<{
  city: string;
  insee: string;
  postcode?: string;
  deptCode?: string;
  deptName?: string;
  region?: string;
} | null> {
  const url =
    `${GEO_API_BASE}/communes?lat=${lat}&lon=${lng}` +
    `&fields=nom,code,codesPostaux,codeDepartement,departement,region`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      nom: string;
      code: string;
      codesPostaux?: string[];
      codeDepartement?: string;
      departement?: { nom?: string };
      region?: { nom?: string };
    }>;
    const commune = json?.[0];
    if (!commune?.nom) return null;
    return {
      city: commune.nom,
      insee: commune.code,
      postcode: commune.codesPostaux?.[0],
      deptCode: commune.codeDepartement,
      deptName: commune.departement?.nom,
      region: commune.region?.nom,
    };
  } catch {
    return null;
  }
}

/**
 * Names venues the bulk pass could not resolve, one point at a time.
 * The BAN only knows addresses, so isolated rural start locations come back
 * empty; the commune boundaries API always resolves them.
 */
async function resolveVenuesByCommune(
  sql: SqlFn,
  limit: number
): Promise<number> {
  const pending = await sql(
    `SELECT id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM venues
     WHERE city IS NULL
     LIMIT $1`,
    [limit]
  );

  let resolved = 0;

  for (const row of pending) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const commune = await communeFromPoint(lat, lng);

    if (!commune) {
      // Mark it so the next run does not retry it forever.
      await sql(
        `UPDATE venues SET geo_precision = 'department', resolved_at = now() WHERE id = $1`,
        [row.id]
      );
      continue;
    }

    await sql(
      `UPDATE venues
         SET city = $2::varchar,
             normalized_city = $3::varchar,
             insee_code = $4::varchar,
             postcode = COALESCE($5::varchar, postcode),
             department_code = COALESCE($6::varchar, department_code),
             department_name = COALESCE($7::varchar, department_name),
             region = COALESCE($8::varchar, region),
             geo_source = 'ban_reverse',
             geo_precision = 'municipality',
             resolved_at = now()
       WHERE id = $1::uuid`,
      [
        row.id,
        commune.city,
        normalizePlace(commune.city),
        commune.insee,
        commune.postcode ?? null,
        commune.deptCode ?? null,
        commune.deptName ?? null,
        commune.region ?? null,
      ]
    );
    resolved++;

    // The API is public and unmetered but shared; stay gentle.
    await new Promise((r) => setTimeout(r, 60));
  }

  return resolved;
}

/**
 * Reverse-geocodes every venue that still lacks a city name.
 *
 * Two stages: the BAN bulk CSV endpoint resolves the bulk of the backlog in a
 * single HTTP request, then the commune boundaries API picks up the rural
 * points the BAN has no address for.
 */
export async function resolveVenueNames(
  sql: SqlFn,
  batchSize = 1000
): Promise<{ resolved: number; failed: number }> {
  const pending = await sql(
    `SELECT id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM venues
     WHERE city IS NULL
     LIMIT $1`,
    [batchSize]
  );

  if (pending.length === 0) return { resolved: 0, failed: 0 };

  // Build the CSV the BAN batch endpoint expects.
  const header = "id,latitude,longitude";
  const lines = pending.map(
    (r) => `${r.id},${Number(r.lat).toFixed(6)},${Number(r.lng).toFixed(6)}`
  );
  const csv = [header, ...lines].join("\n");

  const form = new FormData();
  form.append("data", new Blob([csv], { type: "text/csv" }), "venues.csv");
  form.append("result_columns", "result_city");
  form.append("result_columns", "result_citycode");
  form.append("result_columns", "result_postcode");
  form.append("result_columns", "result_context");

  let body: string;
  try {
    const res = await fetch(`${BAN_BASE}/reverse/csv/`, {
      method: "POST",
      body: form,
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.error(`  BAN bulk reverse failed: HTTP ${res.status}`);
      return { resolved: 0, failed: pending.length };
    }
    body = await res.text();
  } catch (err) {
    console.error(
      `  BAN bulk reverse failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { resolved: 0, failed: pending.length };
  }

  const records = parseCsv(body);
  let resolved = 0;
  let failed = 0;

  for (const record of records) {
    const id = record.id;
    const city = record.result_city;
    if (!id) continue;

    if (!city) {
      failed++;
      continue;
    }

    const ctx = deptFromContext(record.result_context);
    await sql(
      `UPDATE venues
         SET city = $2,
             normalized_city = $3,
             insee_code = NULLIF($4,''),
             postcode = NULLIF($5,''),
             department_code = COALESCE(NULLIF($6,''), department_code),
             department_name = COALESCE(NULLIF($7,''), department_name),
             region = COALESCE(NULLIF($8,''), region),
             geo_source = 'ban_reverse',
             geo_precision = 'municipality',
             resolved_at = now()
       WHERE id = $1`,
      [
        id,
        city,
        normalizePlace(city),
        record.result_citycode ?? "",
        record.result_postcode ?? "",
        ctx.code ?? "",
        ctx.name ?? "",
        ctx.region ?? "",
      ]
    );
    resolved++;
  }

  // Second stage: anything the BAN had no address for is resolved against the
  // commune boundaries, which cover the whole territory.
  if (failed > 0) {
    const viaCommune = await resolveVenuesByCommune(sql, failed);
    resolved += viaCommune;
    failed -= viaCommune;
  }

  return { resolved, failed };
}

/**
 * Minimal RFC-4180 CSV reader — the BAN echoes back free-text fields
 * (place names with commas, quotes) so naive splitting is not safe.
 */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = cells[idx] ?? "";
    });
    return record;
  });
}

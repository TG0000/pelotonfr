import { sql } from "../index";
import type { Race, PaginatedRaces, RaceFilters } from "@/types";

const PAGE_SIZE = 24;

function toDateStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val);
  // Already ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Could be a full ISO timestamp
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().split("T")[0];
}

function buildRaceFromRow(row: Record<string, unknown>): Race {
  return {
    id: row.id as string,
    externalId: row.external_id as string,
    federationId: row.federation_id as number,
    federationSlug: row.federation_slug as Race["federationSlug"],
    name: row.name as string,
    slug: row.slug as string | null,
    sourceUrl: row.source_url as string | null,
    raceDate: toDateStr(row.race_date),
    raceDateEnd: row.race_date_end ? toDateStr(row.race_date_end) : null,
    city: row.city as string,
    departmentCode: row.department_code as string | null,
    departmentName: row.department_name as string | null,
    region: row.region as string | null,
    postcode: row.postcode as string | null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    geocodingStatus: row.geocoding_status as Race["geocodingStatus"],
    discipline: row.discipline as Race["discipline"],
    raceType: row.race_type as string | null,
    level: row.level as Race["level"],
    categories: (row.categories as string[]) ?? [],
    gender: (row.gender as Race["gender"]) ?? "mixed",
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    isCancelled: row.is_cancelled as boolean,
    organizer: row.organizer as string | null,
    contactEmail: row.contact_email as string | null,
    contactPhone: row.contact_phone as string | null,
    notes: row.notes as string | null,
    scrapedAt: row.scraped_at ? toDateStr(row.scraped_at) : "",
    createdAt: row.created_at ? toDateStr(row.created_at) : "",
    updatedAt: row.updated_at ? toDateStr(row.updated_at) : "",
    distanceFromUserKm:
      row.distance_from_user_km != null
        ? Number(row.distance_from_user_km)
        : undefined,
  };
}

export async function getRaces(
  filters: Partial<RaceFilters> = {}
): Promise<PaginatedRaces> {
  const {
    fed = [],
    disc = [],
    cat = [],
    dateFrom,
    dateTo,
    lat,
    lng,
    radius = 50,
    q = "",
    page = 1,
  } = filters;

  const offset = (page - 1) * PAGE_SIZE;
  const radiusMeters = radius * 1000;
  const today = new Date().toISOString().split("T")[0];

  // Build dynamic WHERE clauses
  const conditions: string[] = [
    "r.is_cancelled = false",
    "r.is_active = true",
  ];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (fed.length > 0) {
    conditions.push(`f.slug = ANY($${paramIdx}::text[])`);
    params.push(fed);
    paramIdx++;
  }

  if (disc.length > 0) {
    conditions.push(`r.discipline = ANY($${paramIdx}::text[])`);
    params.push(disc);
    paramIdx++;
  }

  if (cat.length > 0) {
    conditions.push(`r.categories && $${paramIdx}::text[]`);
    params.push(cat);
    paramIdx++;
  }

  const from = dateFrom ?? today;
  conditions.push(`r.race_date >= $${paramIdx}::date`);
  params.push(from);
  paramIdx++;

  if (dateTo) {
    conditions.push(`r.race_date <= $${paramIdx}::date`);
    params.push(dateTo);
    paramIdx++;
  }

  if (q.trim()) {
    conditions.push(
      `(r.name ILIKE $${paramIdx} OR r.city ILIKE $${paramIdx} OR r.organizer ILIKE $${paramIdx})`
    );
    params.push(`%${q.trim()}%`);
    paramIdx++;
  }

  let distanceSelect = "";
  let distanceOrder = "";
  if (lat != null && lng != null) {
    conditions.push(
      `r.location IS NOT NULL AND ST_DWithin(r.location, ST_MakePoint($${paramIdx}, $${paramIdx + 1})::geography, $${paramIdx + 2})`
    );
    params.push(lng, lat, radiusMeters);
    paramIdx += 3;

    distanceSelect = `, ST_Distance(r.location, ST_MakePoint($${paramIdx}, $${paramIdx + 1})::geography) / 1000 AS distance_from_user_km`;
    params.push(lng, lat);
    paramIdx += 2;
    distanceOrder = "distance_from_user_km,";
  }

  const whereClause = conditions.join(" AND ");

  const countParams = [...params];
  // remove distance select params for count query (they're appended after)
  const countParamIdx = distanceSelect ? paramIdx - 2 : paramIdx;

  const countRows = await sql(
    `SELECT COUNT(*) AS total
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${whereClause}`,
    countParams.slice(0, countParamIdx - (distanceSelect ? 2 : 0) - 1)
  );

  // Re-build params cleanly for main query
  const mainParams: unknown[] = [];
  const mainConditions: string[] = [
    "r.is_cancelled = false",
    "r.is_active = true",
  ];
  let mi = 1;

  if (fed.length > 0) {
    mainConditions.push(`f.slug = ANY($${mi}::text[])`);
    mainParams.push(fed);
    mi++;
  }
  if (disc.length > 0) {
    mainConditions.push(`r.discipline = ANY($${mi}::text[])`);
    mainParams.push(disc);
    mi++;
  }
  if (cat.length > 0) {
    mainConditions.push(`r.categories && $${mi}::text[]`);
    mainParams.push(cat);
    mi++;
  }
  mainConditions.push(`r.race_date >= $${mi}::date`);
  mainParams.push(from);
  mi++;
  if (dateTo) {
    mainConditions.push(`r.race_date <= $${mi}::date`);
    mainParams.push(dateTo);
    mi++;
  }
  if (q.trim()) {
    mainConditions.push(
      `(r.name ILIKE $${mi} OR r.city ILIKE $${mi} OR r.organizer ILIKE $${mi})`
    );
    mainParams.push(`%${q.trim()}%`);
    mi++;
  }

  let geoSelectExpr = "";
  if (lat != null && lng != null) {
    mainConditions.push(
      `r.location IS NOT NULL AND ST_DWithin(r.location, ST_MakePoint($${mi}, $${mi + 1})::geography, $${mi + 2})`
    );
    mainParams.push(lng, lat, radiusMeters);
    mi += 3;
    geoSelectExpr = `, ST_Distance(r.location, ST_MakePoint($${mi}, $${mi + 1})::geography) / 1000 AS distance_from_user_km`;
    mainParams.push(lng, lat);
    mi += 2;
  }

  mainParams.push(PAGE_SIZE, offset);
  const limitParam = mi;
  const offsetParam = mi + 1;

  const rows = await sql(
    `SELECT
       r.*,
       f.slug AS federation_slug,
       ST_X(r.location::geometry) AS lng,
       ST_Y(r.location::geometry) AS lat
       ${geoSelectExpr}
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${mainConditions.join(" AND ")}
     ORDER BY ${distanceOrder} r.race_date ASC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    mainParams
  );

  const total = Number((countRows[0] as { total: string }).total);

  return {
    races: rows.map((r) => buildRaceFromRow(r as Record<string, unknown>)),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getRaceById(id: string): Promise<Race | null> {
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE r.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  return buildRaceFromRow(rows[0] as Record<string, unknown>);
}

export async function getUpcomingRaces(limit = 10): Promise<Race[]> {
  const today = new Date().toISOString().split("T")[0];
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE r.race_date >= $1 AND r.is_cancelled = false AND r.is_active = true
     ORDER BY r.race_date ASC
     LIMIT $2`,
    [today, limit]
  );
  return rows.map((r) => buildRaceFromRow(r as Record<string, unknown>));
}

export async function getRacesForMap(
  filters: Partial<RaceFilters> = {}
): Promise<Race[]> {
  // Returns lightweight race data for map markers (no pagination)
  const { fed = [], disc = [], cat = [], dateFrom, dateTo, lat, lng, radius = 50, q = "" } = filters;
  const today = new Date().toISOString().split("T")[0];

  const conditions: string[] = [
    "r.is_cancelled = false",
    "r.is_active = true",
    "r.location IS NOT NULL",
  ];
  const params: unknown[] = [];
  let mi = 1;

  if (fed.length > 0) {
    conditions.push(`f.slug = ANY($${mi}::text[])`);
    params.push(fed);
    mi++;
  }
  if (disc.length > 0) {
    conditions.push(`r.discipline = ANY($${mi}::text[])`);
    params.push(disc);
    mi++;
  }
  if (cat.length > 0) {
    conditions.push(`r.categories && $${mi}::text[]`);
    params.push(cat);
    mi++;
  }

  conditions.push(`r.race_date >= $${mi}::date`);
  params.push(dateFrom ?? today);
  mi++;

  if (dateTo) {
    conditions.push(`r.race_date <= $${mi}::date`);
    params.push(dateTo);
    mi++;
  }
  if (q.trim()) {
    conditions.push(`r.name ILIKE $${mi}`);
    params.push(`%${q.trim()}%`);
    mi++;
  }
  if (lat != null && lng != null) {
    conditions.push(
      `ST_DWithin(r.location, ST_MakePoint($${mi}, $${mi + 1})::geography, $${mi + 2})`
    );
    params.push(lng, lat, radius * 1000);
    mi += 3;
  }

  const rows = await sql(
    `SELECT r.id, r.name, r.race_date, r.city, r.discipline, r.categories, r.level,
            r.federation_id, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.race_date ASC
     LIMIT 2000`,
    params
  );

  return rows.map((r) => buildRaceFromRow(r as Record<string, unknown>));
}

export interface RaceStats {
  total: number;
  thisWeek: number;
  nextMonth: number;
  byFederation: Record<string, number>;
}

export async function getRaceStats(): Promise<RaceStats> {
  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const monthEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const rows = await sql(
    `SELECT f.slug AS federation_slug,
       COUNT(*) FILTER (WHERE r.race_date >= $1 AND r.is_cancelled = false AND r.is_active = true) AS fed_count
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     GROUP BY f.slug`,
    [today]
  );

  const [totRow] = await sql(
    `SELECT
       COUNT(*) FILTER (WHERE r.race_date >= $1 AND r.is_cancelled = false AND r.is_active = true) AS total,
       COUNT(*) FILTER (WHERE r.race_date >= $1 AND r.race_date <= $2 AND r.is_cancelled = false AND r.is_active = true) AS this_week,
       COUNT(*) FILTER (WHERE r.race_date >= $1 AND r.race_date <= $3 AND r.is_cancelled = false AND r.is_active = true) AS next_month
     FROM races r`,
    [today, weekEnd, monthEnd]
  );

  const byFederation: Record<string, number> = {};
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    byFederation[r.federation_slug as string] = Number(r.fed_count);
  }
  const t = totRow as Record<string, unknown>;

  return {
    total: Number(t.total),
    thisWeek: Number(t.this_week),
    nextMonth: Number(t.next_month),
    byFederation,
  };
}

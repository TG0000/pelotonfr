import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { ScrapedRace, UpsertStats } from "../../../lib/scraper-types";
import { toISODate } from "./parse-date";

type SqlFn = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

function computeHash(race: ScrapedRace, federationId: number): string {
  const content = [
    federationId,
    race.externalId,
    toISODate(race.raceDate),
    race.name,
    race.city,
    race.isCancelled ? "1" : "0",
    race.discipline,
    race.categories.sort().join(","),
  ].join("|");
  return createHash("sha256").update(content).digest("hex");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSql(dbUrl: string): SqlFn {
  return neon(dbUrl) as unknown as SqlFn;
}

export async function upsertRaces(
  races: ScrapedRace[],
  federationId: number,
  dbUrl: string
): Promise<UpsertStats> {
  if (races.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const sql = makeSql(dbUrl);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const race of races) {
    const hash = computeHash(race, federationId);
    const slug = slugify(race.name);

    try {
      const result = await sql(
        `INSERT INTO races (
          external_id, federation_id, name, slug, source_url,
          race_date, race_date_end,
          city, department_code, department_name, postcode,
          discipline, race_type, level, categories, gender, distance_km,
          is_cancelled, organizer, contact_email, contact_phone, notes,
          content_hash, geocoding_status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, 'pending'
        )
        ON CONFLICT (federation_id, external_id) DO UPDATE SET
          name           = EXCLUDED.name,
          slug           = EXCLUDED.slug,
          source_url     = EXCLUDED.source_url,
          race_date      = EXCLUDED.race_date,
          race_date_end  = EXCLUDED.race_date_end,
          city           = EXCLUDED.city,
          department_code = EXCLUDED.department_code,
          department_name = EXCLUDED.department_name,
          postcode       = EXCLUDED.postcode,
          discipline     = EXCLUDED.discipline,
          race_type      = EXCLUDED.race_type,
          level          = EXCLUDED.level,
          categories     = EXCLUDED.categories,
          gender         = EXCLUDED.gender,
          distance_km    = EXCLUDED.distance_km,
          is_cancelled   = EXCLUDED.is_cancelled,
          organizer      = EXCLUDED.organizer,
          contact_email  = EXCLUDED.contact_email,
          contact_phone  = EXCLUDED.contact_phone,
          notes          = EXCLUDED.notes,
          content_hash   = EXCLUDED.content_hash,
          scraped_at     = now(),
          geocoding_status = CASE
            WHEN races.city != EXCLUDED.city THEN 'pending'
            ELSE races.geocoding_status
          END
        WHERE races.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING xmax`,
        [
          race.externalId,
          federationId,
          race.name,
          slug,
          race.sourceUrl ?? null,
          toISODate(race.raceDate),
          race.raceDateEnd ? toISODate(race.raceDateEnd) : null,
          race.city,
          race.departmentCode ?? null,
          race.departmentName ?? null,
          race.postcode ?? null,
          race.discipline,
          race.raceType ?? null,
          race.level ?? null,
          race.categories,
          race.gender ?? "mixed",
          race.distanceKm ?? null,
          race.isCancelled,
          race.organizer ?? null,
          race.contactEmail ?? null,
          race.contactPhone ?? null,
          race.notes ?? null,
          hash,
        ]
      );

      if (result.length === 0) {
        skipped++;
      } else {
        const xmax = Number((result[0] as { xmax: string }).xmax);
        if (xmax === 0) {
          inserted++;
        } else {
          updated++;
        }
      }
    } catch (err) {
      console.error(
        `Failed to upsert race ${race.externalId} (${race.name}):`,
        err
      );
    }
  }

  return { inserted, updated, skipped };
}

/**
 * Run geocoding pass: update all races with geocoding_status='pending'.
 */
export async function geocodePendingRaces(dbUrl: string): Promise<number> {
  const sql = makeSql(dbUrl);
  const pending = await sql(
    `SELECT id, city, postcode FROM races WHERE geocoding_status = 'pending' LIMIT 500`
  );

  let geocoded = 0;

  for (const row of pending) {
    const { id, city, postcode } = row as {
      id: string;
      city: string;
      postcode: string | null;
    };

    try {
      const q = encodeURIComponent(city);
      const postcodeParam = postcode
        ? `&postcode=${encodeURIComponent(postcode)}`
        : "";
      const url = `https://api-adresse.data.gouv.fr/search/?q=${q}${postcodeParam}&type=municipality&limit=1`;

      const res = await fetch(url, {
        headers: { "User-Agent": "PelotonFR/1.0 (+https://pelotonfr.fr)" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        await sql(`UPDATE races SET geocoding_status='failed' WHERE id=$1`, [id]);
        continue;
      }

      const data = (await res.json()) as {
        features?: Array<{
          geometry: { coordinates: [number, number] };
          properties: { score: number };
        }>;
      };

      const feature = data.features?.[0];
      if (!feature || feature.properties.score < 0.4) {
        await sql(`UPDATE races SET geocoding_status='failed' WHERE id=$1`, [id]);
        continue;
      }

      const [lng, lat] = feature.geometry.coordinates;
      await sql(
        `UPDATE races SET location = ST_MakePoint($1, $2)::geography, geocoding_status='success' WHERE id=$3`,
        [lng, lat, id]
      );
      geocoded++;
    } catch {
      await sql(
        `UPDATE races SET geocoding_status='failed' WHERE id=$1`,
        [id]
      );
    }

    // Polite delay
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
  }

  return geocoded;
}

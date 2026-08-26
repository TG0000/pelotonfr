/**
 * Race upsert pipeline.
 *
 * For each scraped race:
 *   1. resolve (or create) its venue — from coordinates when the source gives
 *      them, otherwise from the town name;
 *   2. resolve (or create) the recurring event it belongs to, so editions of
 *      the same race across years are linked;
 *   3. upsert the race itself, skipping the write when nothing changed.
 *
 * Geocoding is deliberately NOT done here. Venues created from coordinates are
 * named later by a single bulk reverse-geocoding pass, which keeps the scrape
 * fast and bounds geocoding cost to the number of distinct places rather than
 * the number of races.
 */

import { createHash } from "node:crypto";
import type { ScrapedRace, UpsertStats } from "../../../lib/scraper-types";
import type { SqlFn } from "./db";
import {
  getOrCreateVenueFromCoords,
  getOrCreateVenueFromCity,
  normalizePlace,
} from "./venues";

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function computeHash(race: ScrapedRace, federationId: number): string {
  return createHash("sha256")
    .update(
      [
        federationId,
        race.externalId,
        toISODate(race.raceDate),
        race.raceDateEnd ? toISODate(race.raceDateEnd) : "",
        race.name,
        race.city ?? "",
        race.departmentCode ?? "",
        race.departmentName ?? "",
        race.lat ?? "",
        race.lng ?? "",
        race.isCancelled ? "1" : "0",
        race.discipline,
        race.raceType ?? "",
        race.level ?? "",
        race.notes ?? "",
        race.organizer ?? "",
        race.distanceKm ?? "",
        [...race.categories].sort().join(","),
      ].join("|")
    )
    .digest("hex");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 380);
}

/**
 * The name of the meeting, with everything that varies between its races
 * stripped out.
 *
 * A meeting fields several races — the FFC publishes each category as its own
 * competition — and each carries the category in its title. Stripping only
 * "open", "access", "elite" and "uNN" left enough behind that they still
 * differed: "FOUGERES - OPEN 2-3 + ACCESS 1 H/F" reduced to "fougeres h f" and
 * "FOUGERES - U15 H/F + U17 F" to "fougeres h f f", so one meeting became two.
 */
export function meetingKey(name: string): string {
  const stripped = name
    // Leading edition ordinal: "12e", "3ème", "1er".
    .replace(/^\s*\d{1,3}\s*(?:er|ere|ère|eme|ème|e)\b/i, "")
    // Explicit years.
    .replace(/\b(19|20)\d{2}\b/g, " ")
    // The whole category vocabulary, in every wording the sources use.
    .replace(
      /\b(open|acc?e?ss?|élite|elite|elites|u\s?\d{1,2}\s?f?|cat|pass|espoirs?|masters?|s[ée]niors?|senios|juniors?|cadets?|minimes?|benjamins?|pupilles?|poussins?|dames?|femmes?|f[ée]minin(?:e|es|s)?|hommes?|toutes?\s+cat[ée]gories?|a[1-4])\b[\s\d\-–/+.&,]*/gi,
      " "
    )
    // "Epreuve A", "Epreuve B" — the same afternoon's fields, lettered.
    .replace(/\b[ée]preuve\s+[a-z]\b/gi, " ")
    // Age bands written out: "40 ans et +", "17 ans et plus", "19-39".
    .replace(/\b\d{1,2}\s*(?:[-–]\s*\d{1,2}\s*)?ans?\b(?:\s*et\s*(?:\+|plus))?/gi, " ")
    .replace(/\bet\s*\+/gi, " ")
    // The category strip runs first and eats the number, leaving a bare "ans".
    .replace(/\bans?\b/gi, " ")
    // What the category clause leaves behind: "H/F", "G+F", a lone "F".
    .replace(/\b[hgf]\s*[/+&-]\s*[hgf]\b/gi, " ")
    .replace(/\b[hgf]\b/gi, " ")
    // Separators orphaned by the removals above.
    .replace(/[-–/+&,.]+/g, " ")
    .replace(/\(\s*\)/g, " ");

  return normalizePlace(stripped).slice(0, 380);
}

/**
 * Where a meeting is, for identity purposes.
 *
 * The department, not the commune. Two sources describe the same meeting at
 * different resolutions — the calendar names the town, the results index knows
 * only the department — and keying on the town made a 2025 edition known as
 * "Côtes-d'Armor" a different rendez-vous from its 2026 edition at Tréguidel.
 * The department is the resolution both always have.
 *
 * It is coarse on its own, which is why it is never used on its own: the
 * meeting name almost always carries the town, and for the FSGT races named
 * only by their town the name *is* the town.
 */
export function placeKey(
  _normalizedCity: string | null | undefined,
  departmentCode: string | null | undefined
): string {
  return departmentCode ? `d${departmentCode}` : "";
}

async function resolveVenue(
  sql: SqlFn,
  race: ScrapedRace,
  cache: Map<string, string>
): Promise<string | null> {
  if (race.lat != null && race.lng != null) {
    return getOrCreateVenueFromCoords(
      sql,
      race.lat,
      race.lng,
      {
        city: race.city,
        departmentCode: race.departmentCode,
        departmentName: race.departmentName,
        postcode: race.postcode,
      },
      cache
    );
  }
  if (race.city) {
    return getOrCreateVenueFromCity(
      sql,
      race.city,
      {
        departmentCode: race.departmentCode,
        departmentName: race.departmentName,
        postcode: race.postcode,
      },
      cache
    );
  }
  return null;
}

async function resolveEvent(
  sql: SqlFn,
  race: ScrapedRace,
  federationId: number,
  venueId: string | null,
  cache: Map<string, string>
): Promise<string | null> {
  const key = meetingKey(race.name);
  if (!key) return null;

  /**
   * A meeting is a name, at a place, in a discipline.
   *
   * Name alone put a November cyclo-cross and a June road race at Le Creusot
   * under one identity — 127 events mixed disciplines or seasons that way —
   * while two towns sharing a generic race name collided just as easily.
   */
  const place = placeKey(
    race.city ? normalizePlace(race.city) : null,
    race.departmentCode
  );
  const identity = `${key}|${place}|${race.discipline}`.slice(0, 380);

  const cacheKey = `${federationId}:${identity}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const year = race.raceDate.getUTCFullYear();

  const rows = await sql(
    `INSERT INTO events (federation_id, canonical_name, normalized_name, slug,
                         discipline, primary_venue_id, first_seen_year, last_seen_year, edition_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 1)
     ON CONFLICT (federation_id, normalized_name) DO UPDATE SET
       first_seen_year  = LEAST(events.first_seen_year, EXCLUDED.first_seen_year),
       last_seen_year   = GREATEST(events.last_seen_year, EXCLUDED.last_seen_year),
       primary_venue_id = COALESCE(events.primary_venue_id, EXCLUDED.primary_venue_id)
     RETURNING id`,
    [federationId, race.name, identity, slugify(race.name), race.discipline, venueId, year]
  );

  const id = rows[0].id as string;
  cache.set(cacheKey, id);
  return id;
}

export async function upsertRaces(
  races: ScrapedRace[],
  federationId: number,
  sql: SqlFn
): Promise<UpsertStats> {
  if (races.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  const venueCache = new Map<string, string>();
  const eventCache = new Map<string, string>();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const race of races) {
    try {
      const venueId = await resolveVenue(sql, race, venueCache);
      const eventId = await resolveEvent(sql, race, federationId, venueId, eventCache);
      const hash = computeHash(race, federationId);

      // The venue owns the authoritative city and coordinates. A venue created
      // from raw coordinates has no name yet, so the race takes the best label
      // available now; `backfillRacesFromVenues` replaces it once the bulk
      // reverse-geocoding pass has named the venue.
      //
      // The department name is deliberately NOT used as a fallback. The
      // results index gives only a department, and substituting it put
      // "Vendée" in the town field of 3 804 races — which the interface then
      // showed as though it were where the race is held. The department is
      // already carried in its own columns; an unknown town says so.
      const city = race.city ?? "Lieu à préciser";

      const result = await sql(
        `INSERT INTO races (
           external_id, federation_id, name, slug, source_url,
           race_date, race_date_end,
           city, department_code, department_name, postcode,
           venue_id, event_id, competition_code, season,
           discipline, race_type, level, categories, gender, distance_km,
           is_cancelled, organizer, contact_email, contact_phone, notes,
           content_hash, location, geocoding_status
         )
         VALUES (
           $1::varchar, $2::smallint, $3::varchar, $4::varchar, $5::text,
           $6::date, $7::date,
           $8::varchar, $9::varchar, $10::varchar, $11::varchar,
           $12::uuid, $13::uuid, $14::varchar, $27::smallint,
           $15::varchar, $16::varchar, $17::varchar, $18::text[], $19::varchar, $20::numeric,
           $21::boolean, $22::varchar, $23::text, $24::varchar, $25::text,
           $26::varchar,
           (SELECT location FROM venues WHERE id = $12::uuid),
           CASE
             WHEN (SELECT location FROM venues WHERE id = $12::uuid) IS NULL
             THEN 'pending' ELSE 'success'
           END
         )
         ON CONFLICT (federation_id, external_id) DO UPDATE SET
           name             = EXCLUDED.name,
           slug             = EXCLUDED.slug,
           source_url       = EXCLUDED.source_url,
           race_date        = EXCLUDED.race_date,
           race_date_end    = EXCLUDED.race_date_end,
           city             = EXCLUDED.city,
           department_code  = EXCLUDED.department_code,
           department_name  = EXCLUDED.department_name,
           postcode         = EXCLUDED.postcode,
           -- A source that cannot resolve a venue must not erase one another
           -- source already found: the results index gives only a department,
           -- so re-importing a past race was dropping the venue the calendar
           -- had established for it.
           venue_id         = COALESCE(EXCLUDED.venue_id, races.venue_id),
           event_id         = COALESCE(EXCLUDED.event_id, races.event_id),
           competition_code = EXCLUDED.competition_code,
           season           = EXCLUDED.season,
           discipline       = EXCLUDED.discipline,
           race_type        = EXCLUDED.race_type,
           level            = EXCLUDED.level,
           categories       = EXCLUDED.categories,
           gender           = EXCLUDED.gender,
           distance_km      = EXCLUDED.distance_km,
           is_cancelled     = EXCLUDED.is_cancelled,
           organizer        = EXCLUDED.organizer,
           contact_email    = EXCLUDED.contact_email,
           contact_phone    = EXCLUDED.contact_phone,
           notes            = EXCLUDED.notes,
           content_hash     = EXCLUDED.content_hash,
           location         = COALESCE(EXCLUDED.location, races.location),
           geocoding_status = CASE
                                WHEN EXCLUDED.location IS NOT NULL THEN 'success'
                                ELSE races.geocoding_status
                              END,
           is_active        = true,
           scraped_at       = now()
         WHERE races.content_hash IS DISTINCT FROM EXCLUDED.content_hash
         RETURNING xmax`,
        [
          race.externalId,
          federationId,
          race.name,
          slugify(race.name),
          race.sourceUrl ?? null,
          toISODate(race.raceDate),
          race.raceDateEnd ? toISODate(race.raceDateEnd) : null,
          city,
          race.departmentCode ?? null,
          race.departmentName ?? null,
          race.postcode ?? null,
          venueId,
          eventId,
          race.competitionCode ?? null,
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
          race.season ?? null,
        ]
      );

      if (result.length === 0) {
        skipped++;
        // The content-hash guard above suppresses the whole UPDATE, which would
        // also suppress the derived links — so a race whose description has not
        // changed since before it had a venue or an event would never acquire
        // one. Relationships are repaired separately, and only when missing.
        if (venueId || eventId) {
          await sql(
            `UPDATE races
                SET venue_id = COALESCE(venue_id, $3::uuid),
                    event_id = COALESCE(event_id, $4::uuid)
              WHERE federation_id = $1::smallint
                AND external_id = $2::varchar
                AND (venue_id IS NULL OR event_id IS NULL)`,
            [federationId, race.externalId, venueId, eventId]
          );
        }
      } else if (Number((result[0] as { xmax: string }).xmax) === 0) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      failed++;
      if (failed <= 5) {
        console.error(
          `  upsert failed for ${race.externalId} (${race.name.slice(0, 60)}): ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (failed > 5) {
    console.error(`  ...and ${failed - 5} more upsert failures`);
  }

  return { inserted, updated, skipped };
}

/**
 * Copies venue city/coordinates onto races whose venue was named after the
 * race was written (the bulk reverse-geocoding pass runs after the upsert).
 */
export async function backfillRacesFromVenues(sql: SqlFn): Promise<number> {
  const rows = await sql(
    `UPDATE races r
        -- NULLIF so the placeholder counts as absent: a race whose town is
        -- "Lieu à préciser" has no town, and COALESCE alone treated that
        -- string as an answer and kept it forever.
        SET city             = COALESCE(v.city, NULLIF(r.city, 'Lieu à préciser')),
            postcode         = COALESCE(v.postcode, r.postcode),
            department_code  = COALESCE(v.department_code, r.department_code),
            department_name  = COALESCE(v.department_name, r.department_name),
            region           = COALESCE(v.region, r.region),
            location         = COALESCE(v.location, r.location),
            geocoding_status = CASE WHEN v.location IS NOT NULL THEN 'success' ELSE r.geocoding_status END
       FROM venues v
      WHERE r.venue_id = v.id
        AND v.city IS NOT NULL
        AND (r.city IS DISTINCT FROM v.city
          OR r.location IS NULL
          -- The department and postcode come from the venue too, and a race
          -- whose city already matched would otherwise never receive them.
          OR (r.department_code IS NULL AND v.department_code IS NOT NULL)
          OR (r.postcode IS NULL AND v.postcode IS NOT NULL)
          OR (r.region IS NULL AND v.region IS NOT NULL))
      RETURNING r.id`
  );
  return rows.length;
}

/**
 * Refreshes the denormalised counters on `events`.
 *
 * An edition is a date, not a row: one meeting publishes a separate race per
 * category, and counting rows would report a single-edition event as having
 * held six.
 */
export async function refreshEventAggregates(sql: SqlFn): Promise<void> {
  await sql(
    `UPDATE events e
        SET edition_count = c.editions,
            race_count    = c.races
       FROM (
         SELECT event_id,
                COUNT(DISTINCT race_date) AS editions,
                COUNT(*)                  AS races
           FROM races
          WHERE event_id IS NOT NULL
          GROUP BY event_id
       ) c
      WHERE c.event_id = e.id
        AND (e.edition_count IS DISTINCT FROM c.editions
          OR e.race_count IS DISTINCT FROM c.races)`
  );
}

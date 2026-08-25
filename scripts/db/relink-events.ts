/**
 * Repairs the race → event links.
 *
 *   npx tsx scripts/db/relink-events.ts [--dry-run]
 *
 * Races upserted before events existed — or that were "unchanged" on a later
 * run, and so skipped the write entirely — never received an event_id. Without
 * it, two editions of the same race are unrelated rows and the competitor
 * analysis has nothing to work from.
 *
 * This recomputes the event key from the stored race name, using exactly the
 * same function the scrapers use, and attaches every unlinked race.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { eventKey } from "../scrapers/utils/upsert-races";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 380);
}

interface Row {
  id: string;
  federation_id: number;
  name: string;
  discipline: string;
  venue_id: string | null;
  year: number;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // The backlog is small enough to hold in memory, which avoids paginating over
  // a filter that the loop itself is mutating.
  const rows = (await sql(
    `SELECT id, federation_id, name, discipline, venue_id,
            EXTRACT(YEAR FROM race_date)::int AS year
       FROM races
      WHERE event_id IS NULL
      ORDER BY race_date DESC`
  )) as unknown as Row[];

  console.log(`${rows.length} races without an event.`);
  if (rows.length === 0) return;

  const eventCache = new Map<string, string>();
  let linked = 0;
  let unkeyable = 0;

  for (const row of rows) {
    const key = eventKey(row.name);
    if (!key) {
      unkeyable++;
      continue;
    }

    if (dryRun) {
      linked++;
      continue;
    }

    const cacheKey = `${row.federation_id}:${key}`;
    let eventId = eventCache.get(cacheKey);

    if (!eventId) {
      const inserted = await sql(
        `INSERT INTO events (federation_id, canonical_name, normalized_name, slug,
                             discipline, primary_venue_id, first_seen_year, last_seen_year)
         VALUES ($1::smallint, $2::varchar, $3::varchar, $4::varchar,
                 $5::varchar, $6::uuid, $7::smallint, $7::smallint)
         ON CONFLICT (federation_id, normalized_name) DO UPDATE SET
           first_seen_year  = LEAST(events.first_seen_year, EXCLUDED.first_seen_year),
           last_seen_year   = GREATEST(events.last_seen_year, EXCLUDED.last_seen_year),
           primary_venue_id = COALESCE(events.primary_venue_id, EXCLUDED.primary_venue_id)
         RETURNING id`,
        [
          row.federation_id,
          row.name,
          key,
          slugify(row.name),
          row.discipline,
          row.venue_id,
          row.year,
        ]
      );
      eventId = inserted[0].id as string;
      eventCache.set(cacheKey, eventId);
    }

    await sql(`UPDATE races SET event_id = $2::uuid WHERE id = $1::uuid`, [
      row.id,
      eventId,
    ]);
    linked++;

    if (linked % 500 === 0) console.log(`  ${linked} linked...`);
  }

  if (dryRun) {
    console.log(
      `Dry run: ${linked} would be linked, ${unkeyable} have no usable key.`
    );
    return;
  }

  // Refresh the counters now that the graph changed.
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
      WHERE c.event_id = e.id`
  );

  const [after] = await sql(
    `SELECT (SELECT COUNT(*) FROM races WHERE event_id IS NULL)   AS orphans,
            (SELECT COUNT(*) FROM events WHERE edition_count > 1) AS recurring,
            (SELECT COUNT(DISTINCT e.id) FROM events e
               JOIN races p ON p.event_id = e.id AND p.race_date <  CURRENT_DATE
               JOIN races f ON f.event_id = e.id AND f.race_date >= CURRENT_DATE) AS bridging`
  );

  console.log(
    `\n${linked} races linked` +
      (unkeyable ? `, ${unkeyable} with no usable key` : "") +
      `.\n${after.orphans} still without an event, ` +
      `${after.recurring} recurring events, ` +
      `${after.bridging} spanning past and future.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

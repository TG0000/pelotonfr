/**
 * Rebuilds the meeting identities.
 *
 *   npx tsx scripts/db/reidentify-events.ts [--dry-run]
 *
 * A meeting is a rendez-vous: a name, at a place, in a discipline, recurring
 * year after year. It fields several races, because the federation publishes
 * each category as its own competition and a rider only ever starts in one.
 *
 * The old identity was the name alone, stripped of a few category words. That
 * failed in both directions at once. It split: "FOUGERES - OPEN 2-3 + ACCESS 1
 * H/F" and "FOUGERES - U15 H/F + U17 F" reduced to different keys, so one
 * afternoon became two meetings. And it merged: a November cyclo-cross and a
 * June road race at Le Creusot shared an identity, as did any two towns
 * running a race with a generic name.
 *
 * This recomputes every identity from the stored race rows and remaps them,
 * which is what lets an edition find last year's.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import {
  meetingKey,
  placeKey,
  refreshEventAggregates,
} from "../scrapers/utils/upsert-races";
import { normalizePlace } from "../scrapers/utils/venues";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const dryRun = process.argv.includes("--dry-run");

interface Row {
  id: string;
  name: string;
  federation_id: number;
  discipline: string;
  city: string | null;
  department_code: string | null;
  venue_city: string | null;
  race_date: string;
  event_id: string | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 380);
}

async function main() {
  const rows = (await sql(
    `SELECT r.id, r.name, r.federation_id, r.discipline,
            r.city, r.department_code, r.event_id,
            r.race_date::text AS race_date,
            v.city AS venue_city
     FROM races r
     LEFT JOIN venues v ON v.id = r.venue_id
                        AND v.geo_precision <> 'department'`
  )) as unknown as Row[];

  console.log(`${rows.length} races to re-identify.`);

  /** identity -> the races that belong to it */
  const groups = new Map<string, { rows: Row[]; identity: string; fed: number }>();
  let unkeyable = 0;

  for (const row of rows) {
    const key = meetingKey(row.name);
    if (!key) {
      unkeyable++;
      continue;
    }
    // The venue's town is the reliable one; the race's own can be the
    // placeholder written when a source names no commune.
    const town = row.venue_city ?? row.city;
    const place = placeKey(
      town && town !== "Lieu à préciser" ? normalizePlace(town) : null,
      row.department_code
    );
    const identity = `${key}|${place}|${row.discipline}`.slice(0, 380);
    const groupKey = `${row.federation_id}:${identity}`;

    const g = groups.get(groupKey);
    if (g) g.rows.push(row);
    else groups.set(groupKey, { rows: [row], identity, fed: row.federation_id });
  }

  const before = (await sql(`SELECT count(*)::int AS n FROM events`)) as Array<{
    n: number;
  }>;

  console.log(
    `${groups.size} meetings after regrouping (was ${before[0].n} events).` +
      (unkeyable ? ` ${unkeyable} races have no usable name.` : "")
  );

  const multiSeason = [...groups.values()].filter(
    (g) => new Set(g.rows.map((r) => r.race_date.slice(0, 4))).size > 1
  ).length;
  console.log(`${multiSeason} meetings now span more than one season.`);

  if (dryRun) {
    console.log("\nlargest meetings:");
    for (const g of [...groups.values()].sort((a, b) => b.rows.length - a.rows.length).slice(0, 6)) {
      console.log(`  ${g.rows.length} races — ${g.identity.slice(0, 70)}`);
      for (const r of g.rows.slice(0, 3)) console.log(`      ${r.name.slice(0, 58)}`);
    }
    return { seen: rows.length, written: 0 };
  }

  let remapped = 0;
  for (const g of groups.values()) {
    const first = g.rows[0];
    const years = g.rows.map((r) => Number(r.race_date.slice(0, 4)));

    const inserted = (await sql(
      `INSERT INTO events (federation_id, canonical_name, normalized_name, slug,
                           discipline, first_seen_year, last_seen_year)
       VALUES ($1::smallint, $2::varchar, $3::varchar, $4::varchar,
               $5::varchar, $6::smallint, $7::smallint)
       ON CONFLICT (federation_id, normalized_name) DO UPDATE SET
         first_seen_year = LEAST(events.first_seen_year, EXCLUDED.first_seen_year),
         last_seen_year  = GREATEST(events.last_seen_year, EXCLUDED.last_seen_year)
       RETURNING id`,
      [
        g.fed,
        first.name,
        g.identity,
        slugify(first.name),
        first.discipline,
        Math.min(...years),
        Math.max(...years),
      ]
    )) as Array<{ id: string }>;

    const eventId = inserted[0].id;
    const toMove = g.rows.filter((r) => r.event_id !== eventId).map((r) => r.id);
    if (toMove.length === 0) continue;

    await sql(
      `UPDATE races SET event_id = $1::uuid WHERE id = ANY($2::uuid[])`,
      [eventId, toMove]
    );
    remapped += toMove.length;
  }

  console.log(`${remapped} races moved to a different meeting.`);

  const orphaned = (await sql(
    `DELETE FROM events e
      WHERE NOT EXISTS (SELECT 1 FROM races r WHERE r.event_id = e.id)
      RETURNING id`
  )) as Array<{ id: string }>;
  console.log(`${orphaned.length} empty meetings removed.`);

  await refreshEventAggregates(sql);
  return { seen: rows.length, written: remapped };
}

async function tracked() {
  const run = await startRun(sql, "reidentify-events");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

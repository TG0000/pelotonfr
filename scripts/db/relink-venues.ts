/**
 * Gives every located race a venue, and every venue a name.
 *
 *   npx tsx scripts/db/relink-venues.ts [--dry-run]
 *
 * 3 441 races carried coordinates but no venue: the calendar's map markers gave
 * a position without the scraper ever creating the place it points at. Nothing
 * was broken visibly — until the department name stopped standing in for the
 * town, and those races had nothing left to show.
 *
 * A venue is also what the recurring-event identity will be matched on, so
 * this is groundwork rather than cosmetics: two editions of the same meeting
 * can only be recognised as one rendez-vous if they agree on where they are.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { getOrCreateVenueFromCoords, resolveVenueNames } from "../scrapers/utils/venues";
import { backfillRacesFromVenues } from "../scrapers/utils/upsert-races";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const dryRun = process.argv.includes("--dry-run");

interface Row {
  id: string;
  lat: number;
  lng: number;
  department_code: string | null;
  department_name: string | null;
}

async function main() {
  const rows = (await sql(
    `SELECT id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng,
            department_code, department_name
     FROM races
     WHERE location IS NOT NULL AND venue_id IS NULL`
  )) as unknown as Row[];

  console.log(`${rows.length} located races with no venue.`);
  if (dryRun) {
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}  (${r.department_code ?? "—"})`);
    }
    return { seen: rows.length, written: 0 };
  }

  // Races share venues heavily — one town holds many meetings — so the cache
  // keeps this to one insert per distinct place rather than per race.
  const cache = new Map<string, string>();
  let linked = 0;

  for (const row of rows) {
    try {
      const venueId = await getOrCreateVenueFromCoords(
        sql,
        row.lat,
        row.lng,
        {
          departmentCode: row.department_code ?? undefined,
          departmentName: row.department_name ?? undefined,
        },
        cache
      );
      await sql(`UPDATE races SET venue_id = $2::uuid WHERE id = $1::uuid`, [
        row.id,
        venueId,
      ]);
      linked++;
      if (linked % 500 === 0) console.log(`  ${linked}/${rows.length} linked…`);
    } catch (err) {
      console.warn(`  could not place race ${row.id}:`, err);
    }
  }

  console.log(`${linked} races linked to ${cache.size} distinct venues.`);

  console.log("Naming the venues that still have none…");
  const named = await resolveVenueNames(sql);
  console.log(`  ${named.resolved} named, ${named.failed} unresolved.`);

  const copied = await backfillRacesFromVenues(sql);
  console.log(`${copied} races took their town from their venue.`);

  return { seen: rows.length, written: linked };
}

async function tracked() {
  const run = await startRun(sql, "relink-venues");
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

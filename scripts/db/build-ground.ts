/**
 * Reads the ground around every circuit we hold.
 *
 *   npx tsx scripts/db/build-ground.ts [--limit=40] [--force]
 *
 * A circuit is stored as a line with heights along it, which draws a profile
 * and nothing else. To show the lap in relief — the thing a rider actually
 * recognises about a course — the land around it has to be read as well.
 *
 * The box is the circuit's own bounds with a margin, because a valley the road
 * runs along is only legible when both its sides are in frame.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { groundGrid } from "../../lib/elevation";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

/** A fifth of the circuit's own span on each side. */
const MARGIN = 0.2;

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 40;
  const force = process.argv.includes("--force");

  const traces = (await sql(
    `SELECT t.race_id, t.bounds, r.name
       FROM race_traces t
       JOIN races r ON r.id = t.race_id
      WHERE ($2::boolean OR t.ground IS NULL)
      ORDER BY EXISTS (SELECT 1 FROM user_favorites f WHERE f.race_id = t.race_id) DESC,
               r.race_date ASC
      LIMIT $1::int`,
    [limit, force]
  )) as Array<Record<string, unknown>>;

  console.log(`${traces.length} circuits sans relief.\n`);

  let done = 0;
  for (const t of traces) {
    const b = t.bounds as {
      west: number;
      south: number;
      east: number;
      north: number;
    };
    const dLat = (b.north - b.south) * MARGIN;
    const dLng = (b.east - b.west) * MARGIN;

    const ground = await groundGrid({
      west: b.west - dLng,
      south: b.south - dLat,
      east: b.east + dLng,
      north: b.north + dLat,
    });

    if (!ground) {
      console.log(`  ${String(t.name).slice(0, 44).padEnd(46)} relief indisponible`);
      continue;
    }

    await sql(`UPDATE race_traces SET ground = $2::jsonb WHERE race_id = $1::uuid`, [
      t.race_id,
      JSON.stringify(ground),
    ]);
    done++;
    console.log(
      `  ${String(t.name).slice(0, 44).padEnd(46)} ${Math.round(ground.minZ)}–${Math.round(ground.maxZ)} m`
    );
  }

  console.log(`\n${done} reliefs enregistrés.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

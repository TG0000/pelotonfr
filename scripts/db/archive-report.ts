/**
 * What the archive actually holds, season by season.
 *
 * Printed after a backfill so the run ends with the number that matters —
 * how many meetings now link an edition to an earlier one — rather than with
 * a row count that says nothing about whether the reach-back worked.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const seasons = await sql(
    `SELECT r.season,
            count(*)::int AS races,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM race_results rr WHERE rr.race_id = r.id))::int AS with_results
       FROM races r
      WHERE r.season IS NOT NULL
      GROUP BY r.season
      ORDER BY r.season`
  );

  console.log("season   races   with results");
  for (const row of seasons as Array<Record<string, unknown>>) {
    console.log(
      `${row.season}   ${String(row.races).padStart(5)}   ${String(row.with_results).padStart(12)}`
    );
  }

  const spans = (await sql(
    `SELECT count(*)::int AS multi_season FROM (
       SELECT e.id FROM events e
       JOIN races r ON r.event_id = e.id
       GROUP BY e.id
       HAVING count(DISTINCT r.season) > 1) t`
  )) as Array<{ multi_season: number }>;

  const totals = (await sql(
    `SELECT (SELECT count(*)::int FROM events)       AS meetings,
            (SELECT count(*)::int FROM race_results) AS results,
            (SELECT count(*)::int FROM riders)       AS riders`
  )) as Array<Record<string, number>>;

  console.log(
    `\n${spans[0].multi_season} of ${totals[0].meetings} meetings span more than one season.\n` +
      `${totals[0].results} results across ${totals[0].riders} riders.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

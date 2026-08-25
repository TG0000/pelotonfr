/**
 * Scraper orchestrator.
 *
 *   npm run scrape                 # every federation
 *   npm run scrape -- --only=ffc   # one federation
 *   npm run scrape -- --no-geocode # skip the venue-naming pass
 *
 * Pipeline, in order:
 *   1. scrape each federation into ScrapedRace[]
 *   2. upsert races, creating venues and recurring events along the way
 *   3. name any new venue in one bulk reverse-geocoding request
 *   4. copy the freshly resolved names back onto their races
 *   5. retire races that are long past
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { scrapeFFC } from "./ffc";
import { scrapeFSGT } from "./fsgt";
import { scrapeUFOLEP } from "./ufolep";
import {
  upsertRaces,
  backfillRacesFromVenues,
  refreshEventAggregates,
} from "./utils/upsert-races";
import { resolveVenueNames } from "./utils/venues";
import { createSql } from "./utils/db";
import type { ScraperResult } from "../../lib/scraper-types";

loadEnv();
const DATABASE_URL = requireEnv("DATABASE_URL");

const sql = createSql(DATABASE_URL);

function parseArgs() {
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.split("=")[1]
    ?.toLowerCase();
  const backfillArg = process.argv.find((a) => a.startsWith("--backfill="));
  return {
    only,
    geocode: !process.argv.includes("--no-geocode"),
    /** Days of past FFC calendar to collect, for results ingestion. */
    backfillDays: backfillArg ? Number(backfillArg.split("=")[1]) : 0,
  };
}

function buildScrapers(backfillDays: number) {
  return [
    { name: "FFC", slug: "ffc", fn: () => scrapeFFC({ backfillDays }), fedId: 1 },
    { name: "FSGT", slug: "fsgt", fn: scrapeFSGT, fedId: 2 },
    { name: "UFOLEP", slug: "ufolep", fn: scrapeUFOLEP, fedId: 3 },
  ];
}

async function createLog(federationId: number): Promise<number> {
  const rows = await sql(
    `INSERT INTO scraper_logs (federation_id) VALUES ($1) RETURNING id`,
    [federationId]
  );
  return (rows[0] as { id: number }).id;
}

async function finishLog(
  id: number,
  result: ScraperResult,
  inserted: number,
  updated: number,
  skipped: number
) {
  const status =
    result.errors.length === 0
      ? "success"
      : result.races.length > 0
        ? "partial"
        : "failed";

  await sql(
    `UPDATE scraper_logs SET
       finished_at = now(), status = $2, races_found = $3,
       races_inserted = $4, races_updated = $5, races_skipped = $6,
       error_message = $7, metadata = $8
     WHERE id = $1`,
    [
      id,
      status,
      result.races.length,
      inserted,
      updated,
      skipped,
      result.errors.length
        ? result.errors
            .slice(0, 20)
            .map((e) => e.message)
            .join("; ")
        : null,
      JSON.stringify({
        durationMs: result.durationMs,
        errorCount: result.errors.length,
        withCoordinates: result.races.filter((r) => r.lat != null).length,
      }),
    ]
  );
}

/**
 * Retires races the source no longer lists.
 *
 * Restricted to the horizon the run actually covered: outside it, absence means
 * the scraper never looked, not that the race was withdrawn. Also cleans up rows
 * left behind by earlier scraper generations.
 */
async function retireWithdrawnRaces(
  federationId: number,
  seenExternalIds: string[],
  coverageDays: number
): Promise<number> {
  if (seenExternalIds.length === 0) return 0;

  const rows = await sql(
    `UPDATE races SET is_active = false
      WHERE federation_id = $1::smallint
        AND is_active = true
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
        AND COALESCE(race_date_end, race_date) <= CURRENT_DATE + ($3::int * INTERVAL '1 day')
        AND external_id <> ALL($2::text[])
      RETURNING id`,
    [federationId, seenExternalIds, coverageDays]
  );
  return rows.length;
}

async function retirePastRaces(): Promise<number> {
  // A multi-day race stays current until its LAST day, so the cutoff uses the
  // end date when there is one.
  const rows = await sql(
    `UPDATE races SET is_active = false
      WHERE COALESCE(race_date_end, race_date) < CURRENT_DATE - INTERVAL '7 days'
        AND is_active = true
      RETURNING id`
  );
  return rows.length;
}

async function main() {
  const { only, geocode, backfillDays } = parseArgs();
  const started = Date.now();

  console.log("PelotonFR scraper\n");

  const selected = buildScrapers(backfillDays).filter(
    (s) => !only || s.slug === only
  );
  if (selected.length === 0) {
    console.error(`Unknown federation "${only}".`);
    process.exit(1);
  }

  for (const { name, fn, fedId } of selected) {
    console.log(`--- ${name} ---`);
    const logId = await createLog(fedId);

    try {
      const result = await fn();
      console.log(
        `  scraped ${result.races.length} races, ${result.errors.length} errors (${result.durationMs}ms)`
      );

      const stats = await upsertRaces(result.races, result.federationId, sql);
      console.log(
        `  db: +${stats.inserted} new, ~${stats.updated} updated, =${stats.skipped} unchanged`
      );

      if (result.coverageDays) {
        const withdrawn = await retireWithdrawnRaces(
          result.federationId,
          result.races.map((r) => r.externalId),
          result.coverageDays
        );
        if (withdrawn > 0) {
          console.log(`  ${withdrawn} races no longer listed, retired`);
        }
      }

      await finishLog(logId, result, stats.inserted, stats.updated, stats.skipped);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ${name} failed: ${message}`);
      await sql(
        `UPDATE scraper_logs SET status='failed', finished_at=now(), error_message=$2 WHERE id=$1`,
        [logId, message]
      );
    }
    console.log("");
  }

  if (geocode) {
    console.log("--- venues ---");
    let totalResolved = 0;
    // Each pass drains up to `batchSize` venues; loop until the backlog is gone.
    for (let round = 0; round < 10; round++) {
      const { resolved, failed } = await resolveVenueNames(sql, 1000);
      if (resolved === 0 && failed === 0) break;
      totalResolved += resolved;
      console.log(`  round ${round + 1}: ${resolved} named, ${failed} unresolved`);
      if (resolved === 0) break;
    }
    console.log(`  ${totalResolved} venues named`);

    const backfilled = await backfillRacesFromVenues(sql);
    console.log(`  ${backfilled} races updated from their venue`);
    console.log("");
  }

  await refreshEventAggregates(sql);

  const retired = await retirePastRaces();
  if (retired > 0) console.log(`${retired} past races retired`);

  const [summary] = await sql(
    `SELECT
       COUNT(*) FILTER (WHERE is_active AND NOT is_cancelled
                        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE) AS upcoming,
       COUNT(*) FILTER (WHERE is_active AND NOT is_cancelled
                        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
                        AND location IS NOT NULL) AS located
     FROM races`
  );

  const upcoming = Number(summary.upcoming);
  const located = Number(summary.located);
  const pct = upcoming ? Math.round((located / upcoming) * 100) : 0;

  console.log(
    `\nDone in ${Math.round((Date.now() - started) / 1000)}s — ` +
      `${upcoming} upcoming races, ${located} located (${pct}%)`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

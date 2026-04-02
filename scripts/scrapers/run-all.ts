/**
 * Main scraper orchestrator.
 * Run with: npx tsx scripts/scrapers/run-all.ts
 * Requires DATABASE_URL env var.
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { scrapeFFC } from "./ffc";
import { scrapeFSGT } from "./fsgt";
import { scrapeUFOLEP } from "./ufolep";
import { upsertRaces, geocodePendingRaces } from "./utils/upsert-races";
import type { ScraperResult } from "../../lib/scraper-types";

type SqlFn = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL) as unknown as SqlFn;

async function createLog(federationId: number | null): Promise<number> {
  const rows = await sql(
    `INSERT INTO scraper_logs (federation_id) VALUES ($1) RETURNING id`,
    [federationId]
  );
  return (rows[0] as { id: number }).id;
}

async function updateLog(
  id: number,
  result: ScraperResult,
  inserted: number,
  updated: number,
  skipped: number
) {
  await sql(
    `UPDATE scraper_logs SET
       finished_at = now(),
       status = $2,
       races_found = $3,
       races_inserted = $4,
       races_updated = $5,
       races_skipped = $6,
       error_message = $7
     WHERE id = $1`,
    [
      id,
      result.errors.length === 0
        ? "success"
        : result.races.length > 0
        ? "partial"
        : "failed",
      result.races.length,
      inserted,
      updated,
      skipped,
      result.errors.length > 0
        ? result.errors.map((e) => e.message).join("; ")
        : null,
    ]
  );
}

async function markOldRacesInactive() {
  await sql(
    `UPDATE races SET is_active = false
     WHERE race_date < CURRENT_DATE - INTERVAL '7 days' AND is_active = true`
  );
  console.log("Marked old races inactive");
}

async function main() {
  console.log("🚴 PelotonFR scraper starting...\n");

  const scrapers = [
    { name: "FFC", fn: scrapeFFC, fedId: 1 },
    { name: "FSGT", fn: scrapeFSGT, fedId: 2 },
    { name: "UFOLEP", fn: scrapeUFOLEP, fedId: 3 },
  ];

  for (const { name, fn, fedId } of scrapers) {
    console.log(`\n📡 Running ${name} scraper...`);
    const logId = await createLog(fedId);

    try {
      const result = await fn();
      console.log(
        `  Found ${result.races.length} races, ${result.errors.length} errors (${result.durationMs}ms)`
      );

      const stats = await upsertRaces(result.races, result.federationId, DATABASE_URL!);
      console.log(
        `  DB: +${stats.inserted} inserted, ~${stats.updated} updated, =${stats.skipped} skipped`
      );

      await updateLog(logId, result, stats.inserted, stats.updated, stats.skipped);
    } catch (err) {
      console.error(`  ❌ ${name} scraper failed:`, err);
      await sql(
        `UPDATE scraper_logs SET status='failed', finished_at=now(), error_message=$2 WHERE id=$1`,
        [logId, String(err)]
      );
    }
  }

  // Geocoding pass
  console.log("\n🗺️  Geocoding pending races...");
  const geocoded = await geocodePendingRaces(DATABASE_URL!);
  console.log(`  Geocoded ${geocoded} races`);

  // Mark old races inactive
  console.log("\n🗑️  Marking old races inactive...");
  await markOldRacesInactive();

  console.log("\n✅ Scraping complete!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

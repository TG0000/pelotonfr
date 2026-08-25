/**
 * Standalone venue-naming pass.
 *
 *   npx tsx scripts/scrapers/geocode-only.ts
 *
 * Useful when a scrape ran with --no-geocode, or when the BAN was unreachable
 * at the time. Safe to re-run: it only touches venues that still lack a name.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { resolveVenueNames } from "./utils/venues";
import { backfillRacesFromVenues } from "./utils/upsert-races";
import { createSql } from "./utils/db";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  let total = 0;

  for (let round = 0; round < 20; round++) {
    const { resolved, failed } = await resolveVenueNames(sql, 1000);
    if (resolved === 0 && failed === 0) break;
    total += resolved;
    console.log(`round ${round + 1}: ${resolved} named, ${failed} unresolved`);
    if (resolved === 0) break;
  }

  const backfilled = await backfillRacesFromVenues(sql);
  console.log(`\n${total} venues named, ${backfilled} races updated`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

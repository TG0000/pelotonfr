import { loadEnv } from "../lib/load-env";
import { neon } from "@neondatabase/serverless";
loadEnv();
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT source_url, notes, distance_km, name FROM races
    WHERE federation_id = 1 AND source_url IS NOT NULL
      AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
    LIMIT 2`;
  for (const r of rows as Record<string, unknown>[]) {
    console.log(`${r.name}`);
    console.log(`   url: ${r.source_url}`);
    console.log(`   notes: ${String(r.notes ?? "—").slice(0,120)}`);
    console.log(`   distance: ${r.distance_km}`);
  }
}
main();

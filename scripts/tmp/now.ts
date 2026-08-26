import { loadEnv } from "../lib/load-env";
import { neon } from "@neondatabase/serverless";
loadEnv();
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log("--- upcoming races with a start list, now ---");
  console.table(await sql`
    SELECT count(DISTINCT e.race_id)::int AS upcoming_with_list,
           (SELECT count(*)::int FROM races
             WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE) AS upcoming_total
    FROM engagements e JOIN races r ON r.id = e.race_id
    WHERE COALESCE(r.race_date_end, r.race_date) >= CURRENT_DATE`);

  console.log("\n--- lead time now (positive = caught before the race) ---");
  console.table(await sql`
    SELECT (r.race_date::date - e.first_seen::date) AS days_before, count(*)::int AS races
    FROM races r JOIN (
      SELECT race_id, min(observed_at) AS first_seen FROM engagements GROUP BY race_id) e
      ON e.race_id = r.id
    WHERE r.race_date::date >= CURRENT_DATE - 2
    GROUP BY 1 ORDER BY 1 DESC`);

  console.log("\n--- rider-matching quality ---");
  console.table(await sql`
    SELECT match_method, count(*)::int AS rows
    FROM engagements GROUP BY 1 ORDER BY 2 DESC`);
}
main();

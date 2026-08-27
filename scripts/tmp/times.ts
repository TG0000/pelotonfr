import { loadEnv } from "../lib/load-env";
import { neon } from "@neondatabase/serverless";
loadEnv();
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT r.name, r.categories,
           to_char(a.started_at AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS start_local,
           round(a.moving_time_s / 60.0) AS minutes,
           round(a.distance_m / 1000.0, 1) AS km,
           round((a.distance_m / NULLIF(a.moving_time_s,0)) * 3.6, 1) AS kmh
      FROM strava_activities a JOIN races r ON r.id = a.race_id
     WHERE a.race_id IS NOT NULL AND a.moving_time_s > 1800
     ORDER BY a.started_at`;
  console.log("start  dur   km    km/h   race");
  for (const r of rows as Record<string, unknown>[])
    console.log(`${r.start_local}  ${String(r.minutes).padStart(3)}m ${String(r.km).padStart(5)} ${String(r.kmh).padStart(5)}  ${String(r.name).slice(0,38)}`);

  console.log("\n--- start hour by senior vs youth ---");
  console.table(await sql`
    SELECT CASE WHEN r.categories && ARRAY['u7','u9','u11','u13','u15','u17']::text[]
                THEN 'jeunes' ELSE 'seniors' END AS field,
           count(*)::int AS n,
           to_char(min(a.started_at AT TIME ZONE 'Europe/Paris'), 'HH24:MI') AS earliest,
           to_char(max(a.started_at AT TIME ZONE 'Europe/Paris'), 'HH24:MI') AS latest,
           round(avg(a.moving_time_s)/60) AS avg_minutes
      FROM strava_activities a JOIN races r ON r.id = a.race_id
     WHERE a.moving_time_s > 1800 GROUP BY 1`);
}
main();

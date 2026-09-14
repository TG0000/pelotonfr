/**
 * Les bosses d'une course, lues sur les sorties de ceux qui l'ont courue.
 *
 *   npx tsx scripts/scrapers/strava-efforts.ts [--limit=60]
 *
 * `segments/explore` s'est fermé aux applications non validées. Il reste la
 * meilleure source : une sortie reliée à une course a traversé exactement les
 * segments du parcours. Une lecture par sortie, lue une fois, et la course
 * reçoit ses bosses — les vraies, pas celles du secteur.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { getAccessToken } from "../../lib/db/queries/strava";
import { getActivityEffortSegments, StravaAuthError, StravaRateLimitError } from "../../lib/strava/client";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 60;

  const rides = (await sql(
    `SELECT a.id::text, a.activity_id, a.user_id::text, a.race_id::text, r.name AS race_name
       FROM strava_activities a JOIN races r ON r.id = a.race_id
      WHERE a.race_id IS NOT NULL AND a.efforts_read_at IS NULL
      ORDER BY a.local_date DESC
      LIMIT $1::int`,
    [limit]
  )) as Array<{ id: string; activity_id: number; user_id: string; race_id: string; race_name: string }>;

  console.log(`${rides.length} sorties reliées à une course, jamais lues.`);
  const tokens = new Map<string, string | null>();
  let written = 0;
  let segments = 0;

  for (const ride of rides) {
    let token = tokens.get(ride.user_id);
    if (token === undefined) {
      token = await getAccessToken(ride.user_id);
      tokens.set(ride.user_id, token);
    }
    if (!token) continue;

    try {
      const found = await getActivityEffortSegments(token, Number(ride.activity_id));
      // Une bosse est une bosse : les portions plates et les descentes ne
      // disent rien de ce que la course va coûter.
      const climbs = found.filter((s) => s.averageGrade >= 3 && s.distanceM >= 200);
      if (climbs.length > 0) {
        await sql(
          `INSERT INTO race_segments
             (race_id, segment_id, name, distance_m, average_grade, elevation_m, climb_category, start_lat, start_lng)
           SELECT $1::uuid, d.*
             FROM UNNEST($2::bigint[], $3::varchar[], $4::numeric[], $5::numeric[], $6::numeric[], $7::smallint[], $8::float8[], $9::float8[])
               AS d(segment_id, name, distance_m, average_grade, elevation_m, climb_category, start_lat, start_lng)
           ON CONFLICT (race_id, segment_id) DO UPDATE SET
             name = EXCLUDED.name, distance_m = EXCLUDED.distance_m, average_grade = EXCLUDED.average_grade,
             elevation_m = EXCLUDED.elevation_m, climb_category = EXCLUDED.climb_category,
             start_lat = EXCLUDED.start_lat, start_lng = EXCLUDED.start_lng, fetched_at = now()`,
          [
            ride.race_id,
            climbs.map((c) => c.id), climbs.map((c) => c.name.slice(0, 120)), climbs.map((c) => c.distanceM),
            climbs.map((c) => c.averageGrade), climbs.map((c) => c.elevationM), climbs.map((c) => c.climbCategory),
            climbs.map((c) => c.startLat), climbs.map((c) => c.startLng),
          ]
        );
        segments += climbs.length;
      }
      await sql(`UPDATE strava_activities SET efforts_read_at = now() WHERE id = $1::uuid`, [ride.id]);
      written++;
      console.log(`  ${ride.race_name.slice(0, 44).padEnd(46)} ${climbs.length} bosse${climbs.length > 1 ? "s" : ""} sur ${found.length} segments`);
    } catch (err) {
      if (err instanceof StravaAuthError || err instanceof StravaRateLimitError) {
        console.log(`\n${err.message} Arrêt.`);
        break;
      }
      console.error(`  ${ride.race_name.slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${written} sorties lues, ${segments} bosses posées sur leurs courses.`);
  return { seen: rides.length, written, metadata: { segments } };
}

trackRun(sql, "strava-efforts", main);

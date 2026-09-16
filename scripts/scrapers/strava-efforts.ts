import { publicStravaEnabled } from "../../lib/strava/policy";
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
  if (!publicStravaEnabled()) { console.log("Collective Strava processing disabled pending authorization."); return; }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 60;

  /* Les sorties reliées à une course d'abord (leurs bosses vont sur la
     course), puis toutes les autres de plus de vingt-cinq kilomètres : elles
     ne disent rien d'une course en particulier, mais chacune nomme les
     segments qu'elle a traversés, et c'est l'index qui remplace l'explorateur. */
  const rides = (await sql(
    `SELECT a.id::text, a.activity_id, a.user_id::text, a.race_id::text, COALESCE(r.name, a.name) AS race_name
       FROM strava_activities a LEFT JOIN races r ON r.id = a.race_id
      WHERE a.efforts_read_at IS NULL
        AND (a.race_id IS NOT NULL OR (a.sport_type IN ('Ride', 'GravelRide') AND a.distance_m >= 25000))
      ORDER BY (a.race_id IS NOT NULL) DESC, a.local_date DESC
      LIMIT $1::int`,
    [limit]
  )) as Array<{ id: string; activity_id: number; user_id: string; race_id: string | null; race_name: string }>;

  console.log(`${rides.length} sorties jamais lues.`);
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
      // Tout segment traversé entre dans l'index, bosse ou pas : un circuit
      // de course est plat une fois sur deux.
      if (found.length > 0) {
        await sql(
          `INSERT INTO strava_segments (id, name, distance_m, average_grade, elevation_m, climb_category, start)
           SELECT d.id, d.name, d.distance_m, d.average_grade, d.elevation_m, d.climb_category,
                  CASE WHEN d.start_lat <> 0 THEN ST_MakePoint(d.start_lng, d.start_lat)::geography END
             FROM UNNEST($1::bigint[], $2::text[], $3::numeric[], $4::numeric[], $5::numeric[], $6::smallint[], $7::float8[], $8::float8[])
               AS d(id, name, distance_m, average_grade, elevation_m, climb_category, start_lat, start_lng)
           ON CONFLICT (id) DO UPDATE SET crossings = strava_segments.crossings + 1, seen_at = now()`,
          [found.map((c) => c.id), found.map((c) => c.name.slice(0, 160)), found.map((c) => c.distanceM), found.map((c) => c.averageGrade),
           found.map((c) => c.elevationM), found.map((c) => c.climbCategory), found.map((c) => c.startLat), found.map((c) => c.startLng)]
        );
      }
      // Une bosse est une bosse : les portions plates et les descentes ne
      // disent rien de ce que la course va coûter.
      const climbs = found.filter((s) => s.averageGrade >= 3 && s.distanceM >= 200);
      if (climbs.length > 0 && ride.race_id) {
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
      console.log(`  ${ride.race_name.slice(0, 44).padEnd(46)} ${found.length} segments${ride.race_id ? `, ${climbs.length} bosse${climbs.length > 1 ? "s" : ""} sur la course` : ""}`);
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

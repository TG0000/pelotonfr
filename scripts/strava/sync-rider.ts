/**
 * La synchronisation Strava d'un coureur, depuis la console.
 *
 *   npx tsx scripts/strava/sync-rider.ts <email>
 *
 * Le même chemin que le bouton « Synchroniser » du profil : sorties relues,
 * rattachées aux courses (même jour et lieu, ou titre), tracés écrits.
 */
import { loadEnv } from "../lib/load-env";
import { sql } from "../../lib/db";
import { toDateOnly } from "../../lib/date";
import { getAccessToken, saveActivities, saveFitness } from "../../lib/db/queries/strava";
import { listActivities, getAthleteSummary, listRoutes } from "../../lib/strava/client";
import { saveRouteTrace } from "../../lib/strava/ingest-route";
import { decodePolyline } from "../../lib/polyline";
import { matchRideToRace } from "../../lib/strava/match-races";
import { saveRideTrace } from "../../lib/strava/ingest-trace";
import { matchRideToCircuit } from "../../lib/strava/match-circuit";

loadEnv();
const TRACES_PER_SYNC = 12;

async function main() {
  const email = process.argv[2];
  const [u] = await sql(`SELECT id FROM users WHERE email = $1 OR $1 = ANY(alias_emails)`, [email]);
  if (!u) throw new Error("Compte inconnu.");
  const id = u.id as string;
  const token = await getAccessToken(id);
  if (!token) throw new Error("Strava non connecté.");

  const [connection] = await sql(`SELECT backfilled_at FROM strava_connections WHERE user_id = $1::uuid`, [id]);
  const firstTime = !connection?.backfilled_at;
  const after = new Date(Date.now() - (firstTime ? 2200 : 400) * 86400000);
  const activities = await listActivities(token, after);
  const rides = activities.filter((a) => ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"].includes(a.sport_type));
  const saved = await saveActivities(id, rides);
  const summary = await getAthleteSummary(token);
  await saveFitness(id, summary.ftp, summary.weightKg);
  console.log(`${activities.length} activités lues, ${rides.length} sorties vélo, ${saved} enregistrées.`);

  const [profile] = await sql(`SELECT r.category FROM users u LEFT JOIN riders r ON r.id = u.rider_id WHERE u.id = $1::uuid`, [id]);
  const categories = profile?.category ? [String(profile.category)] : [];
  const pending = await sql(
    `SELECT id, name, local_date, ST_Y(start_location::geometry) AS lat, ST_X(start_location::geometry) AS lng
       FROM strava_activities WHERE user_id = $1::uuid AND race_id IS NULL AND race_match_method = 'none'`,
    [id]
  );
  let linked = 0;
  for (const row of pending) {
    const r = row as Record<string, unknown>;
    const match = await matchRideToRace(sql, {
      name: (r.name as string) ?? "",
      localDate: toDateOnly(r.local_date as string | Date) ?? "",
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      categories,
    });
    if (!match) continue;
    await sql(`UPDATE strava_activities SET race_id = $2::uuid, race_match_method = $3::varchar WHERE id = $1::uuid`, [r.id, match.raceId, match.method]);
    console.log(`  reliée : ${String(r.name)} (${toDateOnly(r.local_date as string | Date)}) → ${match.raceId} par ${match.method}`);
    linked++;
  }

  const untraced = await sql(
    `SELECT activity_id, race_id, name FROM (
       SELECT DISTINCT ON (a.race_id) a.activity_id, a.race_id, a.name, a.local_date FROM strava_activities a
         LEFT JOIN race_traces t ON t.race_id = a.race_id
        WHERE a.user_id = $1::uuid AND a.race_id IS NOT NULL
          AND (t.race_id IS NULL OR t.source = 'segment'
               OR (t.source IN ('strava', 'parcouru') AND t.distance_m * 2 < a.distance_m))
        ORDER BY a.race_id, a.distance_m DESC
     ) best ORDER BY local_date DESC LIMIT $2::int`,
    [id, TRACES_PER_SYNC]
  );
  let traced = 0;
  for (const row of untraced) {
    const r = row as Record<string, unknown>;
    try {
      const outcome = await saveRideTrace(sql, token, Number(r.activity_id), r.race_id as string);
      console.log(`  tracé : ${String(r.name)} → ${outcome}`);
      if (outcome === "stored") traced++;
    } catch (err) {
      console.error(`  tracé refusé : ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  if (firstTime) await sql(`UPDATE strava_connections SET backfilled_at = now() WHERE user_id = $1::uuid`, [id]);

  let circuits = 0;
  if (traced < TRACES_PER_SYNC) {
    const candidates = await sql(
      `SELECT a.activity_id, a.name, a.distance_m, a.local_date, ST_Y(a.start_location::geometry) AS lat, ST_X(a.start_location::geometry) AS lng
         FROM strava_activities a
        WHERE a.user_id = $1::uuid AND a.race_id IS NULL AND a.start_location IS NOT NULL AND a.sport_type IN ('Ride', 'GravelRide')
        ORDER BY a.local_date DESC LIMIT 600`,
      [id]
    );
    for (const row of candidates) {
      if (traced + circuits >= TRACES_PER_SYNC) break;
      const r = row as Record<string, unknown>;
      const donor = await matchRideToCircuit(sql, {
        name: (r.name as string) ?? "",
        localDate: toDateOnly(r.local_date as string | Date) ?? "",
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        distanceM: Number(r.distance_m ?? 0),
      });
      if (!donor) continue;
      try {
        const raced = donor.by === "jour_et_lieu";
        const outcome = await saveRideTrace(sql, token, Number(r.activity_id), donor.raceId, raced ? "strava" : "parcouru");
        console.log(`  boucle : ${String(r.name)} → ${donor.raceId} (${donor.by}) ${outcome}`);
        if (outcome === "stored") circuits++;
        if (raced) {
          await sql(`UPDATE strava_activities SET race_id = $2::uuid, race_match_method = 'location_and_date' WHERE activity_id = $1::bigint AND race_id IS NULL`, [Number(r.activity_id), donor.raceId]);
        }
      } catch (err) {
        console.error(`  boucle refusée : ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
  }
  /* Les itinéraires dessinés : nommés comme la course, partant d'à côté. */
  let routes = 0;
  const [athlete] = await sql(`SELECT athlete_id FROM strava_connections WHERE user_id = $1::uuid`, [id]);
  if (athlete?.athlete_id) {
    for (const r of await listRoutes(token, Number(athlete.athlete_id))) {
      const poly = r.map?.polyline ?? r.map?.summary_polyline;
      // Un itinéraire de huit kilomètres nommé « 8KM caen » n'est pas la
      // course de Caen : il faut la longueur d'une épreuve et un nom sûr.
      if (!poly || r.distance < 15_000 || r.distance > 200_000) continue;
      const first = decodePolyline(poly)[0];
      if (!first) continue;
      const donor = await matchRideToCircuit(sql, { name: r.name, localDate: "1970-01-01", lat: first[0], lng: first[1], distanceM: Math.max(r.distance, 25_000) });
      if (!donor || donor.by === "jour_et_lieu" || donor.score < 0.85) continue;
      const outcome = await saveRouteTrace(sql, donor.raceId, { id: r.id, name: r.name, polyline: poly, distanceM: r.distance });
      console.log(`  itinéraire : ${r.name} → ${donor.raceName} (${outcome})`);
      if (outcome === "stored") routes++;
    }
  }
  await sql(`UPDATE strava_connections SET last_synced_at = now() WHERE user_id = $1::uuid`, [id]);
  console.log(`reliées ${linked}, tracés ${traced}, boucles ${circuits}, itinéraires ${routes}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

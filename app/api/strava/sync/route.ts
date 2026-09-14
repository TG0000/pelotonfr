import { NextResponse } from "next/server";
import { auth } from "@/lib/session";
import { sql } from "@/lib/db";
import { toDateOnly } from "@/lib/date";
import { resolveUser } from "@/lib/db/queries/alerts";
import {
  getAccessToken,
  saveActivities,
  saveFitness,
} from "@/lib/db/queries/strava";
import { listActivities, getAthleteSummary, listRoutes } from "@/lib/strava/client";
import { saveRouteTrace } from "@/lib/strava/ingest-route";
import { decodePolyline } from "@/lib/polyline";
import { matchRideToRace } from "@/lib/strava/match-races";
import { saveRideTrace } from "@/lib/strava/ingest-trace";
import { matchRideToCircuit } from "@/lib/strava/match-circuit";

/** Rides older than this are not worth re-reading on every sync. */
const SYNC_WINDOW_DAYS = 400;

/**
 * Jusqu'où remonte la première synchronisation.
 *
 * Six ans : un coureur qui court depuis cinq ans a déjà parcouru la plupart des
 * circuits de sa région, et ses sorties sont la meilleure source de tracés que
 * nous ayons. La fenêtre courte lui en cachait quatre saisons. Fait une fois,
 * puis marqué — refaire la descente à chaque synchronisation serait payer vingt
 * appels pour retrouver ce qu'on a déjà.
 */
const BACKFILL_DAYS = 2200;

/**
 * How many courses one synchronisation may bring back.
 *
 * A trace costs one Strava read, against a ceiling of a thousand a day shared
 * with everything else we ask of them. A first sync can link forty rides at
 * once, and reading all of them would spend the day's budget on one rider — so
 * a pass takes the most recent handful and the next pass takes the next.
 */
const TRACES_PER_SYNC = 12;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = await resolveUser(userId);
  const token = await getAccessToken(id);
  if (!token) {
    return NextResponse.json({ error: "Strava non connecté" }, { status: 400 });
  }

  try {
    const [connection] = await sql(
      `SELECT backfilled_at FROM strava_connections WHERE user_id = $1::uuid`,
      [id]
    );
    const firstTime = !connection?.backfilled_at;

    const after = new Date(
      Date.now() - (firstTime ? BACKFILL_DAYS : SYNC_WINDOW_DAYS) * 86400000
    );
    const activities = await listActivities(token, after);

    // Only rides can be races; runs and gym sessions are noise here.
    const rides = activities.filter((a) =>
      ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"].includes(a.sport_type)
    );

    const saved = await saveActivities(id, rides);

    const summary = await getAthleteSummary(token);
    await saveFitness(id, summary.ftp, summary.weightKg);

    // The rider's own categories disambiguate a meeting that ran several.
    const [profile] = await sql(
      `SELECT r.category FROM users u LEFT JOIN riders r ON r.id = u.rider_id
        WHERE u.id = $1::uuid`,
      [id]
    );
    const categories = profile?.category ? [String(profile.category)] : [];

    const pending = await sql(
      `SELECT id, name, local_date,
              ST_Y(start_location::geometry) AS lat,
              ST_X(start_location::geometry) AS lng
         FROM strava_activities
        WHERE user_id = $1::uuid AND race_id IS NULL AND race_match_method = 'none'`,
      [id]
    );

    let linked = 0;
    for (const row of pending) {
      const r = row as Record<string, unknown>;
      const match = await matchRideToRace(sql, {
        name: (r.name as string) ?? "",
        // `String()` sur un objet Date donne « Sat Mar 27 » ; dix caractères
        // plus tard, Postgres refuse la date. toDateOnly comprend les deux.
        localDate: toDateOnly(r.local_date as string | Date) ?? "",
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        categories,
      });
      if (!match) continue;

      await sql(
        `UPDATE strava_activities
            SET race_id = $2::uuid, race_match_method = $3::varchar
          WHERE id = $1::uuid`,
        [r.id, match.raceId, match.method]
      );
      linked++;
    }

    // Une seule sortie par course, la plus longue : l'échauffement du matin est
    // aussi « le jour J au même endroit », et il a pris la place de la course
    // trois fois. Une sortie déjà tracée cède à une deux fois plus longue.
    // The link says which race the ride was; the ride says what the course is.
    // Newest first, because a rider syncs after racing and the parcours they
    // just rode is the one somebody is about to look up. Races already carrying
    // a rider's trace are left alone.
    const untraced = await sql(
      `SELECT activity_id, race_id FROM (
         SELECT DISTINCT ON (a.race_id) a.activity_id, a.race_id, a.local_date
           FROM strava_activities a
      LEFT JOIN race_traces t ON t.race_id = a.race_id
          WHERE a.user_id = $1::uuid
            AND a.race_id IS NOT NULL
            AND (t.race_id IS NULL OR t.source = 'segment'
                 OR (t.source IN ('strava', 'parcouru') AND t.distance_m * 2 < a.distance_m))
          ORDER BY a.race_id, a.distance_m DESC
       ) best
       ORDER BY local_date DESC
       LIMIT $2::int`,
      [id, TRACES_PER_SYNC]
    );

    let traced = 0;
    for (const row of untraced) {
      const r = row as Record<string, unknown>;
      try {
        const outcome = await saveRideTrace(
          sql,
          token,
          Number(r.activity_id),
          r.race_id as string
        );
        if (outcome === "stored") traced++;
      } catch {
        // One unreadable activity must not cost the rider their whole sync.
        break;
      }
    }

    if (firstTime) {
      await sql(
        `UPDATE strava_connections SET backfilled_at = now()
          WHERE user_id = $1::uuid`,
        [id]
      );
    }

    /* Les circuits que le coureur a déjà parcourus.
       Une sortie nommée « Buais » ou « Louvigne du désert », partie d'à côté du
       village, documente cette boucle — même trois ans plus tard, parce qu'un
       circuit de village ne bouge pas. C'est la meilleure source de tracés que
       nous ayons, et elle dormait dans son propre historique.

       Après les courses reliées, et jamais à leur place : un tracé du jour J
       reste meilleur. */
    let circuits = 0;
    if (traced < TRACES_PER_SYNC) {
      const candidates = await sql(
        `SELECT a.activity_id, a.name, a.distance_m, a.local_date,
                ST_Y(a.start_location::geometry) AS lat,
                ST_X(a.start_location::geometry) AS lng
           FROM strava_activities a
          WHERE a.user_id = $1::uuid
            AND a.race_id IS NULL
            AND a.start_location IS NOT NULL
            AND a.sport_type IN ('Ride', 'GravelRide')
          ORDER BY a.local_date DESC
          LIMIT 600`,
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
          /* Reconnue par le jour et le lieu, c'est la course : la sortie s'y
             rattache, et son tracé vaut celui du jour J. Reconnue par le nom,
             c'est la boucle sans être l'épreuve. */
          const raced = donor.by === "jour_et_lieu";

          const outcome = await saveRideTrace(
            sql,
            token,
            Number(r.activity_id),
            donor.raceId,
            raced ? "strava" : "parcouru"
          );
          if (outcome === "stored") circuits++;

          if (raced) {
            await sql(
              `UPDATE strava_activities
                  SET race_id = $2::uuid, race_match_method = 'location_and_date'
                WHERE activity_id = $1::bigint AND race_id IS NULL`,
              [Number(r.activity_id), donor.raceId]
            );
          }
        } catch {
          break;
        }
      }
    }

    /* Les itinéraires dessinés dans Strava, nommés comme une course et
       partant d'à côté : la boucle chargée sur le compteur avant de partir. */
    let routes = 0;
    try {
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
          if ((await saveRouteTrace(sql, donor.raceId, { id: r.id, name: r.name, polyline: poly, distanceM: r.distance })) === "stored") routes++;
        }
      }
    } catch {
      /* Les itinéraires sont un bonus : leur échec ne casse pas la synchronisation. */
    }

    return NextResponse.json({
      synced: saved,
      linked,
      traced,
      circuits,
      routes,
      backfill: firstTime,
    });
  } catch (err) {
    console.error("Strava sync:", err);
    const message = err instanceof Error ? err.message : "Erreur de synchronisation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

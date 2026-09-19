import { publicStravaEnabled } from "./policy";
import { getActivityStreams } from "./client";
import { summariseTrace } from "@/lib/trace";
import type { SqlLike } from "./types";
import { overlapOf } from "@/lib/trace-compare";

/**
 * Turns a rider's ride into the course everyone else will read.
 *
 * The synchronisation already tied a ride to the race it was, and then stopped.
 * The link on its own tells the rider what they already knew; the ride's shape
 * is the thing nobody else has. Organisers publish a trace approximately never,
 * so one rider who turned up with a head unit documents that circuit for every
 * rider who looks at it afterwards.
 *
 * A recorded ride outranks a circuit inferred from Strava's segments: the
 * segment route guesses which loop the race used, a ride *is* the loop. So it
 * replaces a 'segment' trace and leaves another rider's ride alone — the first
 * one there is as good as the second, and rewriting it every sync would churn.
 */

export type TraceOutcome = "stored" | "kept" | "unavailable";

export async function saveRideTrace(
  sql: SqlLike,
  token: string,
  activityId: number,
  raceId: string,
  /* 'strava' : la sortie était la course. 'parcouru' : le même coureur a fait
     cette boucle un autre jour, ce qui documente le circuit sans documenter
     l'épreuve — et se dit autrement sur la page. */
  source: "strava" | "parcouru" = "strava"
): Promise<TraceOutcome> {
  if (!publicStravaEnabled()) return "unavailable";
  const streams = await getActivityStreams(token, activityId);
  if (!streams) return "unavailable";

  const trace = summariseTrace(streams.latlng, streams.altitude, streams.distance);
  if (!trace) return "unavailable";
  /* L'échauffement est aussi une sortie du jour, au même endroit : 13 km en
     25 minutes avant le départ. Il a pris la place de la course trois fois.
     En dessous de quinze kilomètres, une sortie n'est pas une épreuve. */
  if (source === "strava" && trace.distanceM < 15_000) return "kept";

  /* Avant de remplacer, on regarde ce qu'on remplace : une boucle déduite
     qui ne recouvre pas la boucle roulée, c'est une détection qui s'est
     trompée, et il faut le savoir pour la corriger. */
  const [existing] = await sql(
    `SELECT source, strava_segment, strava_activity, distance_m, points FROM race_traces WHERE race_id = $1::uuid`,
    [raceId]
  );
  const centreLng = (trace.bounds.west + trace.bounds.east) / 2;
  const centreLat = (trace.bounds.south + trace.bounds.north) / 2;

  const rows = await sql(
    `INSERT INTO race_traces (race_id, source, strava_activity, points, distance_m,
                              elevation_gain_m, min_elevation_m, max_elevation_m,
                              bounds, centre)
     VALUES ($1::uuid, $11::varchar, $2::bigint, $3::jsonb, $4, $5, $6, $7,
             $8::jsonb, ST_MakePoint($9::float8, $10::float8)::geography)
     ON CONFLICT (race_id) DO UPDATE
        SET source          = $11::varchar,
            strava_activity = EXCLUDED.strava_activity,
            points          = EXCLUDED.points,
            distance_m      = EXCLUDED.distance_m,
            elevation_gain_m = EXCLUDED.elevation_gain_m,
            min_elevation_m = EXCLUDED.min_elevation_m,
            max_elevation_m = EXCLUDED.max_elevation_m,
            bounds          = EXCLUDED.bounds,
            centre          = EXCLUDED.centre,
            updated_at      = now()
      -- Un tracé déposé ou couru le jour J prime : on ne remplace qu'une
      -- reconnaissance automatique parmi les segments, ou un itinéraire
      -- dessiné à la main, qui ne comble qu'un vide en attendant qu'un
      -- coureur passe vraiment par là.
      WHERE race_traces.source IN ('segment', 'route')
         OR (race_traces.source IN ('strava', 'parcouru')
             AND race_traces.distance_m * 2 < EXCLUDED.distance_m)
      RETURNING race_id`,
    [
      raceId,
      activityId,
      JSON.stringify(trace.points),
      Math.round(trace.distanceM),
      trace.elevationGainM,
      trace.minElevationM,
      trace.maxElevationM,
      JSON.stringify(trace.bounds),
      centreLng,
      centreLat,
      source,
    ]
  );

  if (rows.length > 0 && existing) {
    const oldSource = String(existing.source);
    const oldPts = existing.points as Array<[number, number, number, number]>;
    const overlap = overlapOf(oldPts, trace.points);
    const oldM = Number(existing.distance_m ?? 0);
    const verdict =
      oldSource === "segment" || oldSource === "route"
        ? overlap >= 0.7 ? "confirme" : "faux"
        : "echauffement";
    const reason =
      verdict === "confirme"
        ? `La boucle ${oldSource} recouvrait la sortie à ${Math.round(overlap * 100)} %.`
        : verdict === "faux"
          ? `La boucle ${oldSource} (${Math.round(oldM / 100) / 10} km) ne recouvre la sortie (${Math.round(trace.distanceM / 100) / 10} km) qu'à ${Math.round(overlap * 100)} % : mauvaise boucle reconnue.`
          : `Une sortie de ${Math.round(oldM / 100) / 10} km remplacée par une de ${Math.round(trace.distanceM / 100) / 10} km : la première était l'échauffement.`;
    await sql(
      `INSERT INTO trace_checks (race_id, old_source, old_ref, old_distance_m, new_source, new_ref, new_distance_m, overlap, verdict, reason)
       VALUES ($1::uuid, $2, $3, $4::int, $5, $6, $7::int, $8::real, $9, $10)`,
      [raceId, oldSource, String(existing.strava_segment ?? existing.strava_activity ?? ""), Math.round(oldM), source, String(activityId), Math.round(trace.distanceM), overlap, verdict, reason]
    ).catch(() => {});
  }
  return rows.length > 0 ? "stored" : "kept";
}

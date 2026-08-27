import { getActivityStreams } from "./client";
import { summariseTrace } from "@/lib/trace";
import type { SqlLike } from "./types";

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
  raceId: string
): Promise<TraceOutcome> {
  const streams = await getActivityStreams(token, activityId);
  if (!streams) return "unavailable";

  const trace = summariseTrace(streams.latlng, streams.altitude, streams.distance);
  if (!trace) return "unavailable";

  const centreLng = (trace.bounds.west + trace.bounds.east) / 2;
  const centreLat = (trace.bounds.south + trace.bounds.north) / 2;

  const rows = await sql(
    `INSERT INTO race_traces (race_id, source, strava_activity, points, distance_m,
                              elevation_gain_m, min_elevation_m, max_elevation_m,
                              bounds, centre)
     VALUES ($1::uuid, 'strava', $2::bigint, $3::jsonb, $4, $5, $6, $7,
             $8::jsonb, ST_MakePoint($9::float8, $10::float8)::geography)
     ON CONFLICT (race_id) DO UPDATE
        SET source          = 'strava',
            strava_activity = EXCLUDED.strava_activity,
            points          = EXCLUDED.points,
            distance_m      = EXCLUDED.distance_m,
            elevation_gain_m = EXCLUDED.elevation_gain_m,
            min_elevation_m = EXCLUDED.min_elevation_m,
            max_elevation_m = EXCLUDED.max_elevation_m,
            bounds          = EXCLUDED.bounds,
            centre          = EXCLUDED.centre,
            updated_at      = now()
      WHERE race_traces.source = 'segment'
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
    ]
  );

  return rows.length > 0 ? "stored" : "kept";
}

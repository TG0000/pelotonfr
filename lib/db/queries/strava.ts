import { sql } from "../index";
import { toDateOnly } from "@/lib/date";
import { refreshTokens, type StravaActivity } from "@/lib/strava/client";

/**
 * Strava connection and activity storage.
 *
 * The interesting join is a ride to the race it was: that is what turns "you
 * finished 12th" into "you finished 12th, on your season's best normalised
 * power, against a field whose winner carries 2637 ranking points".
 */

export interface StravaConnection {
  userId: string;
  athleteId: number;
  athleteName: string | null;
  ftpWatts: number | null;
  weightKg: number | null;
  lastSyncedAt: string | null;
}

export async function getConnection(
  userId: string
): Promise<StravaConnection | null> {
  const rows = await sql(
    `SELECT user_id, athlete_id, athlete_name, ftp_watts, weight_kg, last_synced_at
       FROM strava_connections WHERE user_id = $1::uuid`,
    [userId]
  );
  if (!rows[0]) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    userId: r.user_id as string,
    athleteId: Number(r.athlete_id),
    athleteName: (r.athlete_name as string) ?? null,
    ftpWatts: r.ftp_watts != null ? Number(r.ftp_watts) : null,
    weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
    lastSyncedAt: r.last_synced_at ? String(r.last_synced_at) : null,
  };
}

export async function saveConnection(params: {
  userId: string;
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  athleteName?: string | null;
  homeCity?: string | null;
}): Promise<void> {
  await sql(
    `INSERT INTO strava_connections
       (user_id, athlete_id, access_token, refresh_token, expires_at, scope,
        athlete_name, home_city)
     VALUES ($1::uuid, $2::bigint, $3::text, $4::text, $5::timestamptz, $6::text,
             $7::varchar, $8::varchar)
     ON CONFLICT (user_id) DO UPDATE SET
       athlete_id    = EXCLUDED.athlete_id,
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at    = EXCLUDED.expires_at,
       scope         = EXCLUDED.scope,
       athlete_name  = COALESCE(EXCLUDED.athlete_name, strava_connections.athlete_name),
       home_city     = COALESCE(EXCLUDED.home_city, strava_connections.home_city)`,
    [
      params.userId,
      params.athleteId,
      params.accessToken,
      params.refreshToken,
      params.expiresAt.toISOString(),
      params.scope,
      params.athleteName ?? null,
      params.homeCity ?? null,
    ]
  );

  await sql(
    `UPDATE users SET strava_athlete_id = $2::bigint WHERE id = $1::uuid`,
    [params.userId, params.athleteId]
  );
}

export async function disconnect(userId: string): Promise<void> {
  await sql(`DELETE FROM strava_connections WHERE user_id = $1::uuid`, [userId]);
  await sql(`UPDATE users SET strava_athlete_id = NULL WHERE id = $1::uuid`, [
    userId,
  ]);
}

/**
 * Returns a usable access token, refreshing it when it is close to expiring.
 *
 * A minute of margin avoids the race where a token valid at the check has
 * expired by the time the request lands.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await sql(
    `SELECT access_token, refresh_token, expires_at
       FROM strava_connections WHERE user_id = $1::uuid`,
    [userId]
  );
  if (!rows[0]) return null;

  const r = rows[0] as Record<string, unknown>;
  const expiresAt = new Date(String(r.expires_at));
  if (expiresAt.getTime() - Date.now() > 60_000) {
    return r.access_token as string;
  }

  const refreshed = await refreshTokens(r.refresh_token as string);
  await sql(
    `UPDATE strava_connections
        SET access_token = $2::text, refresh_token = $3::text, expires_at = $4::timestamptz
      WHERE user_id = $1::uuid`,
    [
      userId,
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresAt.toISOString(),
    ]
  );
  return refreshed.accessToken;
}

export async function saveFitness(
  userId: string,
  ftp: number | null,
  weightKg: number | null
): Promise<void> {
  if (ftp == null && weightKg == null) return;
  await sql(
    `UPDATE strava_connections
        SET ftp_watts     = COALESCE($2::int, ftp_watts),
            weight_kg     = COALESCE($3::numeric, weight_kg),
            ftp_updated_at = CASE WHEN $2::int IS NOT NULL THEN now() ELSE ftp_updated_at END
      WHERE user_id = $1::uuid`,
    [userId, ftp, weightKg]
  );
}

/** Stores a batch of activities, keeping whatever race link they already had. */
export async function saveActivities(
  userId: string,
  activities: StravaActivity[]
): Promise<number> {
  if (activities.length === 0) return 0;

  const ids: number[] = [];
  const names: string[] = [];
  const descriptions: (string | null)[] = [];
  const sports: string[] = [];
  const startedAt: string[] = [];
  const localDates: string[] = [];
  const distances: number[] = [];
  const times: number[] = [];
  const elevations: number[] = [];
  const avgWatts: (number | null)[] = [];
  const weightedWatts: (number | null)[] = [];
  const maxWatts: (number | null)[] = [];
  const avgHr: (number | null)[] = [];
  const maxHr: (number | null)[] = [];
  const efforts: (number | null)[] = [];
  const calories: (number | null)[] = [];
  const lats: (number | null)[] = [];
  const lngs: (number | null)[] = [];

  const seen = new Set<number>();

  for (const a of activities) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);

    ids.push(a.id);
    names.push(a.name ?? "");
    descriptions.push(a.description ?? null);
    sports.push(a.sport_type ?? "");
    startedAt.push(a.start_date);
    // start_date_local is the athlete's own wall clock, which is what a race
    // date must be compared against.
    localDates.push(toDateOnly(a.start_date_local) ?? toDateOnly(a.start_date)!);
    distances.push(a.distance ?? 0);
    times.push(a.moving_time ?? 0);
    elevations.push(a.total_elevation_gain ?? 0);
    avgWatts.push(a.average_watts ?? null);
    weightedWatts.push(a.weighted_average_watts ?? null);
    maxWatts.push(a.max_watts ?? null);
    avgHr.push(a.average_heartrate ?? null);
    maxHr.push(a.max_heartrate ?? null);
    efforts.push(a.suffer_score ?? null);
    calories.push(a.calories ?? null);
    lats.push(a.start_latlng?.[0] ?? null);
    lngs.push(a.start_latlng?.[1] ?? null);
  }

  await sql(
    `INSERT INTO strava_activities
       (user_id, activity_id, name, description, sport_type, started_at, local_date,
        distance_m, moving_time_s, elevation_gain_m, average_watts, weighted_watts,
        max_watts, average_heartrate, max_heartrate, relative_effort, calories,
        start_location)
     SELECT $1::uuid, d.*,
            CASE WHEN d.lat IS NULL OR d.lng IS NULL THEN NULL
                 ELSE ST_MakePoint(d.lng, d.lat)::geography END
       FROM UNNEST($2::bigint[], $3::varchar[], $4::text[], $5::varchar[],
                   $6::timestamptz[], $7::date[], $8::numeric[], $9::int[],
                   $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[],
                   $14::numeric[], $15::numeric[], $16::int[], $17::int[],
                   $18::float8[], $19::float8[])
         AS d(activity_id, name, description, sport_type, started_at, local_date,
              distance_m, moving_time_s, elevation_gain_m, average_watts,
              weighted_watts, max_watts, average_heartrate, max_heartrate,
              relative_effort, calories, lat, lng)
     ON CONFLICT (user_id, activity_id) DO UPDATE SET
       name              = EXCLUDED.name,
       description       = EXCLUDED.description,
       distance_m        = EXCLUDED.distance_m,
       moving_time_s     = EXCLUDED.moving_time_s,
       elevation_gain_m  = EXCLUDED.elevation_gain_m,
       average_watts     = EXCLUDED.average_watts,
       weighted_watts    = EXCLUDED.weighted_watts,
       max_watts         = EXCLUDED.max_watts,
       average_heartrate = EXCLUDED.average_heartrate,
       max_heartrate     = EXCLUDED.max_heartrate,
       relative_effort   = EXCLUDED.relative_effort,
       calories          = EXCLUDED.calories,
       start_location    = COALESCE(EXCLUDED.start_location, strava_activities.start_location),
       synced_at         = now()`,
    [
      userId, ids, names, descriptions, sports, startedAt, localDates,
      distances, times, elevations, avgWatts, weightedWatts, maxWatts,
      avgHr, maxHr, efforts, calories, lats, lngs,
    ]
  );

  await sql(
    `UPDATE strava_connections SET last_synced_at = now() WHERE user_id = $1::uuid`,
    [userId]
  );

  return ids.length;
}

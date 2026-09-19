import { openToken, sealToken } from "@/lib/security";
import { transaction } from "@/lib/db/transaction";
import { symmetricEncrypt } from "better-auth/crypto";
import { sql } from "../index";
import { toDateOnly } from "@/lib/date";
import { refreshTokens, revokeToken, type StravaActivity } from "@/lib/strava/client";

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
  /* Le même athlète Strava relié à un autre compte : l'insertion butait sur
     la contrainte d'unicité d'athlete_id, que le ON CONFLICT ci-dessous ne
     couvre pas, l'erreur était avalée plus haut, et le profil répétait « relie
     ton compte Strava » sans que la liaison puisse aboutir une seule fois.
     Le passage par Strava prouve qui se connecte : la liaison le suit. */
  await sql(`UPDATE users SET strava_athlete_id = NULL WHERE strava_athlete_id = $2::bigint AND id <> $1::uuid`, [params.userId, params.athleteId]);
  const moved = await sql(`DELETE FROM strava_connections WHERE athlete_id = $2::bigint AND user_id <> $1::uuid RETURNING user_id`, [params.userId, params.athleteId]);
  if (moved.length > 0) console.warn(`STRAVA_ATHLETE_MOVED: athlète ${params.athleteId} repris par le compte qui vient de s'authentifier`);

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
      sealToken(params.accessToken),
      sealToken(params.refreshToken),
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

export class StravaDisconnectError extends Error {}

export async function disconnect(userId: string): Promise<void> {
  await transaction(async client => {
    const { rows } = await client.query("SELECT access_token,refresh_token FROM strava_connections WHERE user_id=$1::uuid FOR UPDATE", [userId]);
    const identity = await client.query(`SELECT a.id,a."emailVerified",EXISTS(SELECT 1 FROM account WHERE "userId"=a.id AND "providerId"<>'strava') AS other
      FROM users u JOIN "user" a ON a.id=u.clerk_id WHERE u.id=$1::uuid`,[userId]);
    if (identity.rows[0] && !identity.rows[0].emailVerified && !identity.rows[0].other) {
      throw new StravaDisconnectError("Ajoute et vérifie une adresse e-mail avant de déconnecter ton seul moyen de connexion.");
    }
    if (rows[0]) await client.query("INSERT INTO strava_revocations(token_encrypted,refresh_encrypted) VALUES ($1,$2)",[rows[0].access_token,rows[0].refresh_token]);
    const affected=await client.query(`SELECT race_id FROM race_traces WHERE contributed_by=$1::uuid
      OR strava_activity IN(SELECT activity_id FROM strava_activities WHERE user_id=$1::uuid)`,[userId]);
    const races=affected.rows.map(row=>row.race_id);
    await client.query("DELETE FROM road_views WHERE race_id=ANY($1::uuid[])",[races]);
    await client.query("DELETE FROM race_segments WHERE race_id=ANY($1::uuid[])",[races]);
    await client.query("DELETE FROM trace_checks WHERE race_id=ANY($1::uuid[])",[races]);
    await client.query("DELETE FROM race_traces WHERE race_id=ANY($1::uuid[])",[races]);
    await client.query("DELETE FROM race_trace_versions WHERE snapshot->>'contributed_by'=$1 OR snapshot->>'strava_activity' IN (SELECT activity_id::text FROM strava_activities WHERE user_id=$1::uuid)",[userId]);
    await client.query("DELETE FROM circuit_submissions WHERE user_id=$1::uuid",[userId]);
    await client.query("DELETE FROM strava_activities WHERE user_id=$1::uuid",[userId]);
    await client.query("DELETE FROM strava_connections WHERE user_id=$1::uuid",[userId]);
    await client.query("DELETE FROM strava_sync_jobs WHERE user_id=$1::uuid",[userId]);
    await client.query(`DELETE FROM account WHERE "providerId"='strava' AND "userId"=(SELECT clerk_id FROM users WHERE id=$1::uuid)`,[userId]);
    await client.query("UPDATE users SET strava_athlete_id=NULL WHERE id=$1::uuid",[userId]);
  });
  // Local deletion succeeds even if the provider is down. The durable queue is
  // retried by the daily maintenance job and contains only encrypted tokens.
  // Local purge is already committed; the durable queue survives provider/worker failure.
  await processRevocations(1).catch(() => {});
}

export async function processRevocations(limit=1): Promise<void> {
  for (let i=0;i<limit;i++) await transaction(async client => {
    const {rows}=await client.query("SELECT id,token_encrypted,refresh_encrypted FROM strava_revocations WHERE retry_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
    const row=rows[0]; if(!row)return;
    let revoked=false;
    try {
      revoked=await revokeToken(openToken(row.token_encrypted));
      if(!revoked && row.refresh_encrypted) {
        const next=await refreshTokens(openToken(row.refresh_encrypted));
        await client.query("UPDATE strava_revocations SET token_encrypted=$2,refresh_encrypted=$3 WHERE id=$1",[row.id,sealToken(next.accessToken),sealToken(next.refreshToken)]);
        revoked=await revokeToken(next.accessToken);
      }
    } catch { /* Retain the encrypted pair solely to retry revocation. */ }
    if(revoked)await client.query("DELETE FROM strava_revocations WHERE id=$1::uuid",[row.id]);
    else await client.query("UPDATE strava_revocations SET attempts=attempts+1,retry_at=now()+interval '1 day' WHERE id=$1::uuid",[row.id]);
  });
}

/**
 * Returns a usable access token, refreshing it when it is close to expiring.
 *
 * A minute of margin avoids the race where a token valid at the check has
 * expired by the time the request lands.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  return transaction(async (client) => {
    // Hold a per-connection lock until the rotated pair is committed. Other
    // workers then read the new token instead of spending the old refresh token.
    const { rows } = await client.query(
      `SELECT access_token, refresh_token, expires_at
         FROM strava_connections WHERE user_id = $1::uuid FOR UPDATE`, [userId]
    );
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() - Date.now() > 60_000) {
      return openToken(row.access_token);
    }
    const refreshed = await refreshTokens(openToken(row.refresh_token));
    await client.query(
      `UPDATE strava_connections SET access_token = $2, refresh_token = $3, expires_at = $4
        WHERE user_id = $1::uuid`,
      [userId, sealToken(refreshed.accessToken), sealToken(refreshed.refreshToken), refreshed.expiresAt]
    );
    const key = process.env.BETTER_AUTH_SECRET;
    if (!key) throw new Error("Auth encryption is not configured");
    await client.query(
      `UPDATE account SET "accessToken" = $2, "refreshToken" = $3, "accessTokenExpiresAt" = $4,
          "updatedAt" = now()
        WHERE "providerId" = 'strava' AND "userId" = (SELECT clerk_id FROM users WHERE id = $1::uuid)`,
      [userId, await symmetricEncrypt({ key, data: refreshed.accessToken }),
       await symmetricEncrypt({ key, data: refreshed.refreshToken }), refreshed.expiresAt]
    );
    return refreshed.accessToken;
  });
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
  activities: StravaActivity[],
  query = sql
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

  await query(
    `INSERT INTO strava_activities
       (user_id, activity_id, name, description, sport_type, started_at, local_date,
        distance_m, moving_time_s, elevation_gain_m, average_watts, weighted_watts,
        max_watts, average_heartrate, max_heartrate, relative_effort, calories,
        start_location)
     -- Columns are named rather than expanded with d.*: the row carries lat
     -- and lng so the point can be built, and those two are not target
     -- columns, so the wildcard produced twenty expressions for eighteen
     -- columns and every sync failed before writing a single ride.
     SELECT $1::uuid, d.activity_id, d.name, d.description, d.sport_type,
            d.started_at, d.local_date, d.distance_m, d.moving_time_s,
            d.elevation_gain_m, d.average_watts, d.weighted_watts, d.max_watts,
            d.average_heartrate, d.max_heartrate, d.relative_effort, d.calories,
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

  return ids.length;
}

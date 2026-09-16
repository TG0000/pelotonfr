import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { transaction } from "@/lib/db/transaction";
import { consumeLimit } from "@/lib/rate-limit";
import { getAccessToken, saveActivities } from "@/lib/db/queries/strava";
import { listActivitiesPage } from "./client";
import { matchRideToRace } from "./match-races";
import { toDateOnly } from "@/lib/date";

export async function readSyncJob(userId: string) {
  const [row] = await sql(`SELECT id,status,synced,linked,page,error_code,retry_at FROM strava_sync_jobs WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 1`,[userId]);
  return row ?? null;
}
export async function startSyncJob(userId: string, days: number) {
  if (![30,90,365].includes(days)) throw new Error("INVALID_SYNC_WINDOW");
  await sql(`INSERT INTO strava_sync_jobs(user_id,after_at,before_at)
    SELECT $1::uuid,now()-make_interval(days=>$2),now() WHERE EXISTS(SELECT 1 FROM strava_connections WHERE user_id=$1::uuid)
    ON CONFLICT(user_id) WHERE status IN ('queued','running','waiting') DO NOTHING`,[userId,days]);
  return readSyncJob(userId);
}
/** A persisted cursor and lease allow another request to resume after a timeout. */
export async function advanceSyncJob(userId: string, id: string) {
  const lease=randomUUID();
  const [job] = await sql(`UPDATE strava_sync_jobs SET status='running',lease_token=$3::uuid,lease_until=now()+interval '60 seconds',updated_at=now()
    WHERE id=$1::uuid AND user_id=$2::uuid AND status IN ('queued','running','waiting')
      AND (lease_until IS NULL OR lease_until<now()) AND (retry_at IS NULL OR retry_at<=now()) RETURNING *`,[id,userId,lease]);
  if (!job) return readSyncJob(userId);
  try {
    if (!(await consumeLimit("strava:reads:quarter",40,900)) || !(await consumeLimit("strava:reads:day",400,86400))) throw new Error("STRAVA_ACTIVITIES_429");
    const token=await getAccessToken(userId);
    if(!token) throw new Error("STRAVA_DISCONNECTED");
    const batch=await listActivitiesPage(token,new Date(String(job.after_at)),new Date(String(job.before_at)),Number(job.page));
    const rides=batch.filter(row=>["Ride","GravelRide","MountainBikeRide"].includes(row.sport_type));
    const matches: Array<{ activityId: number; raceId: string; method: string }> = [];
    for(const ride of rides) {
      const match=await matchRideToRace(sql,{name:ride.name,localDate:toDateOnly(ride.start_date_local)!,lat:ride.start_latlng?.[0]??null,lng:ride.start_latlng?.[1]??null,categories:[]});
      if(match)matches.push({activityId:ride.id,...match});
    }
    await transaction(async client=>{
      // Disconnect takes the same lock before purging, preventing a late worker
      // from restoring data after the user has disconnected.
      const connection=await client.query("SELECT user_id FROM strava_connections WHERE user_id=$1::uuid FOR UPDATE",[userId]);
      if(!connection.rowCount)throw new Error("STRAVA_DISCONNECTED");
      const owned=await client.query("SELECT id FROM strava_sync_jobs WHERE id=$1::uuid AND lease_token=$2::uuid AND status='running' FOR UPDATE",[id,lease]);
      if(!owned.rowCount)return;
      const query=async(text:string,params?:unknown[])=>(await client.query(text,params)).rows;
      await saveActivities(userId,rides,query);
      for(const match of matches)await client.query(`UPDATE strava_activities SET race_id=$3::uuid,race_match_method=$4
        WHERE user_id=$1::uuid AND activity_id=$2 AND race_id IS NULL`,[userId,match.activityId,match.raceId,match.method]);
      const completed=batch.length<50;
      await client.query(`UPDATE strava_sync_jobs SET page=page+1,synced=synced+$3,linked=linked+$4,status=$5,
        lease_token=NULL,lease_until=NULL,retry_at=NULL,error_code=NULL,attempts=0,updated_at=now() WHERE id=$1::uuid AND lease_token=$2::uuid`,
        [id,lease,rides.length,matches.length,completed?"completed":"queued"]);
      if(completed)await client.query("UPDATE strava_connections SET last_synced_at=now() WHERE user_id=$1::uuid",[userId]);
    });
  } catch(error) {
    const limited=error instanceof Error && error.message==="STRAVA_ACTIVITIES_429";
    const disconnected=error instanceof Error && error.message==="STRAVA_DISCONNECTED";
    await sql(`UPDATE strava_sync_jobs SET status=CASE WHEN $4::boolean THEN 'cancelled' WHEN attempts>=4 THEN 'failed' ELSE 'waiting' END,
      attempts=attempts+1,error_code=$3,retry_at=now()+make_interval(secs=>$5),lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=$1::uuid AND lease_token=$2::uuid`,[id,lease,limited?"quota":disconnected?"disconnected":"retry",disconnected,limited?900:60]);
  }
  return readSyncJob(userId);
}

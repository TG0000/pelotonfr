import {transaction} from "@/lib/db/transaction";
import {publicStravaEnabled} from "@/lib/strava/policy";

/** Caller must verify operator identity. Review is serialized per race. */
export async function reviewCircuit(id:string,approve:boolean,operator:string){
 if(approve&&!publicStravaEnabled())throw new Error("Public Strava sharing is disabled");
 await transaction(async client=>{
  const {rows}=await client.query("SELECT * FROM circuit_submissions WHERE id=$1::uuid FOR UPDATE",[id]);
  const row=rows[0];if(!row||row.status!=="pending")return;
  await client.query("SELECT id FROM races WHERE id=$1 FOR UPDATE",[row.race_id]);
  if(approve){
   await client.query("INSERT INTO race_trace_versions(race_id,snapshot,reviewed_by) SELECT race_id,to_jsonb(t),$2 FROM race_traces t WHERE race_id=$1",[row.race_id,operator]);
   const p=row.payload;
   await client.query(`INSERT INTO race_traces(race_id,source,contributed_by,strava_segment,points,distance_m,elevation_gain_m,min_elevation_m,max_elevation_m,bounds,centre)
    VALUES($1,'depose',$2,$3,$4,$5,$6,$7,$8,$9,ST_MakePoint($10,$11)::geography)
    ON CONFLICT(race_id) DO UPDATE SET source=EXCLUDED.source,contributed_by=EXCLUDED.contributed_by,strava_activity=NULL,strava_segment=EXCLUDED.strava_segment,points=EXCLUDED.points,distance_m=EXCLUDED.distance_m,elevation_gain_m=EXCLUDED.elevation_gain_m,min_elevation_m=EXCLUDED.min_elevation_m,max_elevation_m=EXCLUDED.max_elevation_m,bounds=EXCLUDED.bounds,centre=EXCLUDED.centre,updated_at=now()`,[row.race_id,row.user_id,row.segment_id,JSON.stringify(p.points),p.distance_m,p.elevation_gain_m,p.min_elevation_m,p.max_elevation_m,JSON.stringify(p.bounds),p.centreLng,p.centreLat]);
   await client.query("DELETE FROM race_streetview WHERE race_id=$1",[row.race_id]);
   await client.query("DELETE FROM road_views WHERE race_id=$1",[row.race_id]);
  }
  await client.query("UPDATE circuit_submissions SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1",[id,approve?"approved":"rejected",operator]);
 });
}

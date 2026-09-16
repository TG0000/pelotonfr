import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabasePool, transaction } from "../../lib/db/transaction";
import { resolveUser } from "../../lib/db/queries/alerts";
import { joinClub, getMembership } from "../../lib/db/queries/club";
import { consumeLimit } from "../../lib/rate-limit";
import { submitContact, readContact } from "../../app/(main)/contact/actions";

if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/pelotonfr_preview_v02") {
  throw new Error("Integration tests require the isolated pelotonfr_preview_v02 database");
}
after(async () => { await getDatabasePool().end(); });

test("Verified identity never migrates another account based on caller-supplied email", async () => {
  const a=randomUUID(), b=randomUUID(); let ua="",ub="";
  try {
    await getDatabasePool().query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,'Fixture A',$3,true),($2,'Fixture B',$4,false)`,[a,b,`${a}@example.test`,`${b}@example.test`]);
    ua=await resolveUser(a); ub=await resolveUser(b,`${a}@example.test`);
    assert.notEqual(ua,ub);
    const row=await getDatabasePool().query("SELECT email FROM users WHERE id=$1",[ub]);assert.equal(row.rows[0].email,null);
    await getDatabasePool().query(`UPDATE "user" SET "emailVerified"=true WHERE id=$1`,[b]);
    assert.equal(await resolveUser(b),ub);
    const verified=await getDatabasePool().query("SELECT email FROM users WHERE id=$1",[ub]);assert.equal(verified.rows[0].email,`${b}@example.test`);
  } finally {
    await getDatabasePool().query("DELETE FROM users WHERE clerk_id=ANY($1::text[])",[[a,b]]);
    await getDatabasePool().query(`DELETE FROM "user" WHERE id=ANY($1::text[])`,[[a,b]]);
  }
});
test("Concurrent club requests grant no access; reviewed role survives repeat requests", async () => {
  const authId=randomUUID(),club=randomUUID();let user="";
  try {
    await getDatabasePool().query(`INSERT INTO "user"(id,name,email) VALUES ($1,'Club fixture',$2)`,[authId,`${authId}@example.test`]);user=await resolveUser(authId);
    await getDatabasePool().query("INSERT INTO clubs(id,name,normalized_name) VALUES ($1,'Fixture club',$2)",[club,club]);
    const roles=await Promise.all([joinClub(user,club),joinClub(user,club)]);
    assert.deepEqual(roles,["pending","pending"]);assert.equal(await getMembership(user),null);
    await getDatabasePool().query("UPDATE club_members SET role='responsable',verified_at=now() WHERE user_id=$1",[user]);
    assert.equal(await joinClub(user,club),"responsable");assert.equal((await getMembership(user))?.role,"responsable");
  } finally {
    await getDatabasePool().query("DELETE FROM clubs WHERE id=$1",[club]);
    await getDatabasePool().query("DELETE FROM users WHERE clerk_id=$1",[authId]);
    await getDatabasePool().query(`DELETE FROM "user" WHERE id=$1`,[authId]);
  }
});
test("The distributed counter admits exactly five simultaneous requests", async () => {
  const key=`integration:${randomUUID()}`;
  try { const results=await Promise.all(Array.from({length:12},()=>consumeLimit(key,5,60)));assert.equal(results.filter(Boolean).length,5); }
  finally { await getDatabasePool().query("DELETE FROM request_limits WHERE key=$1",[key]); }
});
test("Contact receipt grants only its own ticket; guessed codes reveal no message", async () => {
  const result=await submitContact("support","Integration fixture, safe to remove.");
  assert.ok(result.id && result.code);
  try {
    const own=await readContact(result.id,result.code);assert.equal(own.ticket?.message,"Integration fixture, safe to remove.");
    const wrong=await readContact(result.id,"x".repeat(32));assert.ok(wrong.error);assert.equal(wrong.ticket,undefined);
    const row=await getDatabasePool().query("SELECT access_hash FROM support_requests WHERE id=$1",[result.id]);assert.notEqual(row.rows[0].access_hash,result.code);
  } finally { await getDatabasePool().query("DELETE FROM support_requests WHERE id=$1",[result.id]); }
});
test("A failing transaction leaves neither business write nor migration record", async () => {
  const key=`rollback:${randomUUID()}`;
  await assert.rejects(transaction(async client=>{
    await client.query("INSERT INTO request_limits(key,count,expires_at) VALUES ($1,1,now())",[key]);
    await client.query("SELECT deliberately_nonexistent_function_for_test()");
  }));
  const row=await getDatabasePool().query("SELECT key FROM request_limits WHERE key=$1",[key]);assert.equal(row.rowCount,0);
});

test("Strava jobs resume by page, keep incomplete status and purge locally when revocation fails", async () => {
  const { saveConnection,disconnect,processRevocations } = await import("../../lib/db/queries/strava");
  const { startSyncJob,advanceSyncJob } = await import("../../lib/strava/sync-job");
  const authId=randomUUID(), athleteId=Date.now();let user="",encrypted="";
  const originalFetch=globalThis.fetch;
  let providerFails=false,revocationWorks=false,activityCalls=0;
  globalThis.fetch=async(input,options)=>{
    const url=String(input);
    if(!url.startsWith("https://www.strava.com/")) return originalFetch(input,options);
    if(url.includes("/oauth/deauthorize"))return new Response("{}",{status:revocationWorks?200:503});
    if(url.includes("/oauth/token"))return new Response("{}",{status:503});
    assert.ok(url.includes("/athlete/activities"));activityCalls++;
    if(providerFails)return new Response("{}",{status:429});
    const page=Number(new URL(url).searchParams.get("page"));
    const rows=Array.from({length:page===1?50:1},(_,i)=>({id:athleteId+page*100+i,name:`Fixture ride ${authId}`,sport_type:"Ride",start_date:new Date().toISOString(),start_date_local:new Date().toISOString(),distance:10000,moving_time:1800,total_elevation_gain:100}));
    return new Response(JSON.stringify(rows),{status:200});
  };
  try {
    await getDatabasePool().query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Strava fixture',$2,true)`,[authId,`${authId}@example.test`]);
    user=await resolveUser(authId);
    await saveConnection({userId:user,athleteId,accessToken:"fake-access",refreshToken:"fake-refresh",expiresAt:new Date(Date.now()+3600000),scope:"read"});
    const first=await startSyncJob(user,30);assert.ok(first);
    const next=await advanceSyncJob(user,String(first.id));assert.equal(next?.status,"queued");assert.equal(next?.synced,50);
    let connection=await getDatabasePool().query("SELECT last_synced_at,access_token FROM strava_connections WHERE user_id=$1",[user]);
    assert.equal(connection.rows[0].last_synced_at,null);encrypted=connection.rows[0].access_token;
    const finished=await advanceSyncJob(user,String(first.id));assert.equal(finished?.status,"completed");assert.equal(finished?.synced,51);
    await advanceSyncJob(user,String(first.id));assert.equal(activityCalls,2);
    connection=await getDatabasePool().query("SELECT last_synced_at FROM strava_connections WHERE user_id=$1",[user]);assert.ok(connection.rows[0].last_synced_at);
    providerFails=true;
    const retry=await startSyncJob(user,30);assert.ok(retry);
    const waiting=await advanceSyncJob(user,String(retry.id));assert.equal(waiting?.status,"waiting");assert.equal(waiting?.error_code,"quota");
    await disconnect(user);
    for(const table of ["strava_connections","strava_activities","strava_sync_jobs"]) {
      const rows=await getDatabasePool().query(`SELECT 1 FROM ${table} WHERE user_id=$1`,[user]);assert.equal(rows.rowCount,0);
    }
    const queue=await getDatabasePool().query("SELECT id FROM strava_revocations WHERE token_encrypted=$1",[encrypted]);assert.equal(queue.rowCount,1);
    revocationWorks=true;
    await getDatabasePool().query("UPDATE strava_revocations SET retry_at=now() WHERE token_encrypted=$1",[encrypted]);await processRevocations(1);
    assert.equal((await getDatabasePool().query("SELECT 1 FROM strava_revocations WHERE token_encrypted=$1",[encrypted])).rowCount,0);
  } finally {
    globalThis.fetch=originalFetch;
    await getDatabasePool().query("DELETE FROM strava_revocations WHERE token_encrypted=$1",[encrypted]);
    await getDatabasePool().query("DELETE FROM users WHERE clerk_id=$1",[authId]);
    await getDatabasePool().query(`DELETE FROM "user" WHERE id=$1`,[authId]);
  }
});

test("A reviewed opposition survives rider, ranking and raw start-list reimports", async () => {
  const {suppressPublication}=await import("../../lib/publication-suppression");
  const uci=String(Date.now()),last=`Suppression${randomUUID().replaceAll('-','')}`,first="Élodie";
  const operator=`test-${randomUUID()}`;
  const pool=getDatabasePool();
  const race=(await pool.query("SELECT id FROM races LIMIT 1")).rows[0].id;
  try {
    const rider=(await pool.query("INSERT INTO riders(uci_id,last_name,first_name,normalized_name) VALUES($1,$2,$3,$4) RETURNING id",[uci,last,first,`${last} elodie`])).rows[0].id;
    await pool.query("INSERT INTO engagements(race_id,rider_id,last_name_raw,first_name_raw) VALUES($1,$2,$3,$4)",[race,rider,last,first]);
    await suppressPublication(uci,`${last} ${first}`,operator);
    assert.equal((await pool.query("SELECT 1 FROM riders WHERE id=$1",[rider])).rowCount,0);
    const insert=await pool.query("INSERT INTO riders(uci_id,last_name,first_name,normalized_name) VALUES($1,$2,$3,$4) RETURNING id",[uci,last,"ELODIE",`${last} elodie`]);
    assert.equal(insert.rowCount,0);
    assert.equal((await pool.query("INSERT INTO engagements(race_id,last_name_raw,first_name_raw) VALUES($1,$2,'ELODIE (FRA)') RETURNING id",[race,last])).rowCount,0);
    assert.equal((await pool.query("INSERT INTO rider_rankings(ranking_type,season,uci_id) VALUES('TEST',2026,$1) RETURNING id",[uci])).rowCount,0);
    const unrelated=await pool.query("INSERT INTO riders(uci_id,last_name,first_name,normalized_name) VALUES($1,$2,'Paul',$3) RETURNING id",[uci+'1',last,`${last} paul`]);
    assert.equal(unrelated.rowCount,1);
  } finally {
    await pool.query("DELETE FROM riders WHERE uci_id=ANY($1::text[])",[[uci,uci+'1']]);
    await pool.query("DELETE FROM publication_suppressions WHERE reviewed_by=$1",[operator]);
  }
});

test("Legacy token encryption is atomic, dry by default and idempotent; concurrent refresh rotates once", async()=>{
 const {migrateStravaTokens}=await import("../../lib/strava/migrate-tokens");
 const {getAccessToken}=await import("../../lib/db/queries/strava");
 const {symmetricDecrypt}=await import("better-auth/crypto");
 const {openToken}=await import("../../lib/security");
 const authId=randomUUID(),accountId=randomUUID();let user="";let refreshes=0;
 const realFetch=globalThis.fetch;
 const oldClient=process.env.STRAVA_CLIENT_ID,oldSecret=process.env.STRAVA_CLIENT_SECRET;
 process.env.STRAVA_CLIENT_ID="fixture";process.env.STRAVA_CLIENT_SECRET="fixture";
 globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url.includes("strava.com/oauth/token")){refreshes++;return new Response(JSON.stringify({access_token:"c".repeat(40),refresh_token:"d".repeat(40),expires_at:Math.floor(Date.now()/1000)+21600}),{status:200,headers:{"Content-Type":"application/json"}});}
  return realFetch(input,init);
 };
 try{
  const pool=getDatabasePool();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Token fixture',$2,true)`,[authId,`${authId}@example.test`]);user=await resolveUser(authId);
  await pool.query(`INSERT INTO account(id,"accountId","providerId","userId","accessToken","refreshToken") VALUES($1,$2,'strava',$3,$4,$5)`,[accountId,"fixture-"+authId,authId,"a".repeat(40),"b".repeat(40)]);
  await pool.query("INSERT INTO strava_connections(user_id,athlete_id,access_token,refresh_token,expires_at,scope) VALUES($1,$2,$3,$4,now()-interval '1 hour','read')",[user,Date.now(),"a".repeat(40),"b".repeat(40)]);
  assert.deepEqual(await migrateStravaTokens(),{business:1,auth:1});
  assert.equal((await pool.query("SELECT access_token FROM strava_connections WHERE user_id=$1",[user])).rows[0].access_token,"a".repeat(40));
  assert.deepEqual(await migrateStravaTokens(true),{business:1,auth:1});assert.deepEqual(await migrateStravaTokens(true),{business:0,auth:0});
  const tokens=await Promise.all([getAccessToken(user),getAccessToken(user),getAccessToken(user)]);
  assert.deepEqual(tokens,["c".repeat(40),"c".repeat(40),"c".repeat(40)]);assert.equal(refreshes,1);
  const business=(await pool.query("SELECT refresh_token FROM strava_connections WHERE user_id=$1",[user])).rows[0];assert.equal(openToken(business.refresh_token),"d".repeat(40));
  const account=(await pool.query('SELECT "refreshToken" FROM account WHERE id=$1',[accountId])).rows[0];assert.equal(await symmetricDecrypt({key:process.env.BETTER_AUTH_SECRET!,data:account.refreshToken}),"d".repeat(40));
 }finally{
  globalThis.fetch=realFetch;
  if(oldClient===undefined)delete process.env.STRAVA_CLIENT_ID;else process.env.STRAVA_CLIENT_ID=oldClient;
  if(oldSecret===undefined)delete process.env.STRAVA_CLIENT_SECRET;else process.env.STRAVA_CLIENT_SECRET=oldSecret;
  await getDatabasePool().query("DELETE FROM users WHERE clerk_id=$1",[authId]);await getDatabasePool().query('DELETE FROM "user" WHERE id=$1',[authId]);
 }
});

test("A circuit proposal does not overwrite the public trace; approval archives the previous version",async()=>{
 const {reviewCircuit}=await import("../../lib/circuit-review");
 const pool=getDatabasePool(),authId=randomUUID(),raceId=randomUUID();let user="";
 const flag=process.env.ENABLE_PUBLIC_STRAVA;
 try{
  await pool.query(`INSERT INTO "user"(id,name,email) VALUES($1,'Circuit fixture',$2)`,[authId,`${authId}@example.test`]);user=await resolveUser(authId);
  await pool.query("INSERT INTO races(id,federation_id,name,race_date,external_id,city,discipline) VALUES($1,1,'Circuit fixture',CURRENT_DATE,$2,'Fixture','route')",[raceId,raceId]);
  const points=[[0,49,10,0],[0.01,49,20,700]],payload={points,distance_m:700,elevation_gain_m:10,min_elevation_m:10,max_elevation_m:20,bounds:{west:0,east:0.01,south:49,north:49},centreLng:0.005,centreLat:49};
  await pool.query("INSERT INTO race_traces(race_id,source,points,distance_m) VALUES($1,'guide','[]',900)",[raceId]);
  const submission=(await pool.query("INSERT INTO circuit_submissions(race_id,user_id,segment_id,name,payload) VALUES($1,$2,12345,'Fixture',$3) RETURNING id",[raceId,user,JSON.stringify(payload)])).rows[0].id;
  assert.equal(Number((await pool.query("SELECT distance_m FROM race_traces WHERE race_id=$1",[raceId])).rows[0].distance_m),900);
  process.env.ENABLE_PUBLIC_STRAVA="false";await assert.rejects(reviewCircuit(submission,true,"test"));
  process.env.ENABLE_PUBLIC_STRAVA="true";await reviewCircuit(submission,true,"test");await reviewCircuit(submission,true,"test");
  const trace=(await pool.query("SELECT distance_m,contributed_by FROM race_traces WHERE race_id=$1",[raceId])).rows[0];assert.equal(Number(trace.distance_m),700);assert.equal(trace.contributed_by,user);
  const versions=await pool.query("SELECT snapshot FROM race_trace_versions WHERE race_id=$1",[raceId]);assert.equal(versions.rowCount,1);assert.equal(Number(versions.rows[0].snapshot.distance_m),900);
 }finally{
  if(flag===undefined)delete process.env.ENABLE_PUBLIC_STRAVA;else process.env.ENABLE_PUBLIC_STRAVA=flag;
  await pool.query("DELETE FROM races WHERE id=$1",[raceId]);await pool.query("DELETE FROM users WHERE clerk_id=$1",[authId]);await pool.query('DELETE FROM "user" WHERE id=$1',[authId]);
 }
});

test("The migration command rolls back an entire failing file and its journal",async()=>{
 const {writeFile,unlink}=await import("node:fs/promises");
 const {execFile}=await import("node:child_process");
 const {promisify}=await import("node:util");
 const filename=`999_fixture_${randomUUID()}.sql`,path=new URL(`../../db/migrations/${filename}`,import.meta.url);
 const key=`migration-fixture-${randomUUID()}`;
 try{
  await writeFile(path,`INSERT INTO request_limits(key,count,expires_at) VALUES('${key}',1,now()); SELECT peloton_fixture_missing_function();`);
  await assert.rejects(promisify(execFile)(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/db/migrate.ts"],{cwd:process.cwd(),env:process.env}),/MIGRATION_FAILED/);
  assert.equal((await getDatabasePool().query("SELECT 1 FROM request_limits WHERE key=$1",[key])).rowCount,0);
  assert.equal((await getDatabasePool().query("SELECT 1 FROM schema_migrations WHERE filename=$1",[filename])).rowCount,0);
 }finally{await unlink(path).catch(()=>{});}
});

test("Migration and place-check dry runs create neither venues nor tracking rows",async()=>{
 const {execFile}=await import("node:child_process");const {promisify}=await import("node:util");
 const pool=getDatabasePool();
 const counts=async()=> (await pool.query("SELECT (SELECT count(*) FROM venues)::int AS venues,(SELECT count(*) FROM collector_runs)::int AS runs,(SELECT count(*) FROM schema_migrations)::int AS migrations")).rows[0];
 const before=await counts();
 for(const script of ["scripts/db/migrate.ts","scripts/db/place-check.ts","scripts/db/data-guard.ts"]){
  await promisify(execFile)(process.execPath,["node_modules/tsx/dist/cli.mjs",script,"--dry-run"],{cwd:process.cwd(),env:process.env});
 }
 assert.deepEqual(await counts(),before);
});

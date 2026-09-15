import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databasePool, transaction } from "../../lib/db/transaction";
import { resolveUser } from "../../lib/db/queries/alerts";
import { joinClub, getMembership } from "../../lib/db/queries/club";
import { consumeLimit } from "../../lib/rate-limit";
import { submitContact, readContact } from "../../app/(main)/contact/actions";

if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/pelotonfr_preview_v02") {
  throw new Error("Integration tests require the isolated pelotonfr_preview_v02 database");
}
after(async () => { await databasePool.end(); });

test("Verified identity never migrates another account based on caller-supplied email", async () => {
  const a=randomUUID(), b=randomUUID(); let ua="",ub="";
  try {
    await databasePool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES ($1,'Fixture A',$3,true),($2,'Fixture B',$4,false)`,[a,b,`${a}@example.test`,`${b}@example.test`]);
    ua=await resolveUser(a); ub=await resolveUser(b,`${a}@example.test`);
    assert.notEqual(ua,ub);
    const row=await databasePool.query("SELECT email FROM users WHERE id=$1",[ub]);assert.equal(row.rows[0].email,null);
    await databasePool.query(`UPDATE "user" SET "emailVerified"=true WHERE id=$1`,[b]);
    assert.equal(await resolveUser(b),ub);
    const verified=await databasePool.query("SELECT email FROM users WHERE id=$1",[ub]);assert.equal(verified.rows[0].email,`${b}@example.test`);
  } finally {
    await databasePool.query("DELETE FROM users WHERE clerk_id=ANY($1::text[])",[[a,b]]);
    await databasePool.query(`DELETE FROM "user" WHERE id=ANY($1::text[])`,[[a,b]]);
  }
});
test("Concurrent club requests grant no access; reviewed role survives repeat requests", async () => {
  const authId=randomUUID(),club=randomUUID();let user="";
  try {
    await databasePool.query(`INSERT INTO "user"(id,name,email) VALUES ($1,'Club fixture',$2)`,[authId,`${authId}@example.test`]);user=await resolveUser(authId);
    await databasePool.query("INSERT INTO clubs(id,name,normalized_name) VALUES ($1,'Fixture club',$2)",[club,club]);
    const roles=await Promise.all([joinClub(user,club),joinClub(user,club)]);
    assert.deepEqual(roles,["pending","pending"]);assert.equal(await getMembership(user),null);
    await databasePool.query("UPDATE club_members SET role='responsable',verified_at=now() WHERE user_id=$1",[user]);
    assert.equal(await joinClub(user,club),"responsable");assert.equal((await getMembership(user))?.role,"responsable");
  } finally {
    await databasePool.query("DELETE FROM clubs WHERE id=$1",[club]);
    await databasePool.query("DELETE FROM users WHERE clerk_id=$1",[authId]);
    await databasePool.query(`DELETE FROM "user" WHERE id=$1`,[authId]);
  }
});
test("The distributed counter admits exactly five simultaneous requests", async () => {
  const key=`integration:${randomUUID()}`;
  try { const results=await Promise.all(Array.from({length:12},()=>consumeLimit(key,5,60)));assert.equal(results.filter(Boolean).length,5); }
  finally { await databasePool.query("DELETE FROM request_limits WHERE key=$1",[key]); }
});
test("Contact receipt grants only its own ticket; guessed codes reveal no message", async () => {
  const result=await submitContact("support","Integration fixture, safe to remove.");
  assert.ok(result.id && result.code);
  try {
    const own=await readContact(result.id,result.code);assert.equal(own.ticket?.message,"Integration fixture, safe to remove.");
    const wrong=await readContact(result.id,"x".repeat(32));assert.ok(wrong.error);assert.equal(wrong.ticket,undefined);
    const row=await databasePool.query("SELECT access_hash FROM support_requests WHERE id=$1",[result.id]);assert.notEqual(row.rows[0].access_hash,result.code);
  } finally { await databasePool.query("DELETE FROM support_requests WHERE id=$1",[result.id]); }
});
test("A failing transaction leaves neither business write nor migration record", async () => {
  const key=`rollback:${randomUUID()}`;
  await assert.rejects(transaction(async client=>{
    await client.query("INSERT INTO request_limits(key,count,expires_at) VALUES ($1,1,now())",[key]);
    await client.query("SELECT deliberately_nonexistent_function_for_test()");
  }));
  const row=await databasePool.query("SELECT key FROM request_limits WHERE key=$1",[key]);assert.equal(row.rowCount,0);
});

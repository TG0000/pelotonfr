import { transaction } from "@/lib/db/transaction";

/** Call only after operator authorization and independent identity review. */
export async function suppressPublication(uci: string, name: string, reviewedBy: string): Promise<void> {
  if ((!uci && !name) || (uci && !/^\d{5,20}$/.test(uci)) || name.length>240 || (name && name.trim().length<5)) throw new Error("Invalid matching identity");
  await transaction(async client => {
    // Import triggers take the shared lock: no in-flight import can resurrect a deleted row.
    await client.query("SELECT pg_advisory_xact_lock(72400304)");
    for (const [kind,value] of [["uci",uci],["name",name]]) {
      if(value) await client.query("INSERT INTO publication_suppressions(key_hash,kind,reviewed_by) VALUES(publication_key($1,$2),$1,$3) ON CONFLICT DO NOTHING",[kind,value,reviewedBy]);
    }
    const {rows}=await client.query("SELECT id,uci_id FROM riders WHERE ($1<>'' AND publication_key('uci',uci_id)=publication_key('uci',$1)) OR ($2<>'' AND publication_key('name',concat_ws(' ',last_name,first_name))=publication_key('name',$2))",[uci,name]);
    const ids=rows.map(row=>row.id);
    await client.query("DELETE FROM rider_rankings WHERE rider_id=ANY($1::uuid[]) OR ($2<>'' AND publication_key('uci',uci_id)=publication_key('uci',$2))",[ids,uci]);
    await client.query("DELETE FROM engagements WHERE rider_id=ANY($1::uuid[]) OR ($2<>'' AND publication_key('name',concat_ws(' ',last_name_raw,first_name_raw))=publication_key('name',$2))",[ids,name]);
    await client.query("UPDATE users SET uci_id=NULL WHERE rider_id=ANY($1::uuid[])",[ids]);
    await client.query("DELETE FROM riders WHERE id=ANY($1::uuid[])",[ids]);
  });
}

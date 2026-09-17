import {notFound} from "next/navigation";
import {revalidatePath} from "next/cache";
import {isOperator} from "@/lib/admin";
import {getAuthUser} from "@/lib/session";
import {isUuid} from "@/lib/validation";
import {sql} from "@/lib/db";
import {reviewCircuit} from "@/lib/circuit-review";
import {publicStravaEnabled} from "@/lib/strava/policy";
export const dynamic="force-dynamic";
export const metadata={title:"Vérifier les circuits",robots:{index:false}};
async function review(form:FormData){
 "use server";
 if(!(await isOperator()))throw new Error("Forbidden");
 const user=await getAuthUser(),id=form.get("id"),approve=form.get("decision")==="approve";
 if(!user||!isUuid(id)||(approve&&form.get("confirmed")!=="yes"))throw new Error("Vérification requise");
 await reviewCircuit(id,approve,user.id);revalidatePath("/","layout");
}
export default async function Circuits(){
 if(!(await isOperator()))notFound();
 const rows=await sql("SELECT s.id,s.name,s.segment_id,s.payload,r.name AS race FROM circuit_submissions s JOIN races r ON r.id=s.race_id WHERE status='pending' ORDER BY s.created_at LIMIT 100");
 return <article className="mx-auto max-w-3xl p-6 space-y-5"><h1 className="text-3xl font-bold">Propositions de circuits</h1><p>Vérifie le parcours avec l’organisateur avant validation. Toute version publique remplacée est archivée.</p>
 {!publicStravaEnabled()&&<p>La publication Strava reste désactivée en attente de validation des usages collectifs.</p>}
 {rows.map(row=><form key={String(row.id)} action={review} className="border rounded p-4 space-y-3"><h2 className="font-bold">{String(row.race)} · {String(row.name)}</h2><a className="underline" href={`https://www.strava.com/segments/${String(row.segment_id)}`} target="_blank" rel="noreferrer">Examiner le segment proposé</a><input name="id" type="hidden" value={String(row.id)}/><label className="block"><input type="checkbox" name="confirmed" value="yes"/>Parcours confirmé auprès de l’organisateur.</label><button name="decision" value="approve" disabled={!publicStravaEnabled()} className="border p-2 disabled:opacity-50">Publier</button> <button name="decision" value="reject" className="border p-2">Rejeter</button></form>)}
 {!rows.length&&<p>Aucune proposition en attente.</p>}</article>;
}

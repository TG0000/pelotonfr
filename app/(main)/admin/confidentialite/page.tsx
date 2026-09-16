import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperator } from "@/lib/admin";
import { getAuthUser } from "@/lib/session";
import { suppressPublication } from "@/lib/publication-suppression";
export const dynamic="force-dynamic";
export const metadata={title:"Oppositions à la republication",robots:{index:false}};
async function suppress(form:FormData){
  "use server";
  if(!(await isOperator()))throw new Error("Forbidden");
  const operator=await getAuthUser();
  if(!operator || form.get("reviewed")!=="yes")throw new Error("Vérification requise");
  await suppressPublication(String(form.get("uci")??"").trim(),String(form.get("name")??"").trim(),operator.id);
  revalidatePath("/","layout");
}
export default async function PrivacyReview(){
  if(!(await isOperator()))notFound();
  return <article className="mx-auto max-w-2xl p-6 space-y-5"><h1 className="text-3xl font-bold">Respecter une opposition</h1>
    <p>Après vérification de la demande reçue via Contact, retire le profil, ses résultats, classements et engagements. Les empreintes de correspondance empêchent leur réimportation.</p>
    <p>Un nom seul peut correspondre à plusieurs personnes : vérifie les homonymes. Renseigne le nom complet uniquement si son retrait est confirmé, afin de couvrir aussi les listes sans identifiant UCI. Traite les demandes concernant un mineur avec le représentant habilité.</p>
    <form action={suppress} className="space-y-4">
      <label className="block">Identifiant UCI<input name="uci" pattern="[0-9]{5,20}" className="block w-full border rounded p-2" /></label>
      <label className="block">Nom puis prénom, tels que publiés<input name="name" maxLength={240} className="block w-full border rounded p-2" /></label>
      <label className="flex gap-2"><input required type="checkbox" name="reviewed" value="yes" />Identité, portée du retrait et homonymes vérifiés avec le demandeur.</label>
      <button className="rounded border p-3">Retirer et empêcher la republication</button>
    </form>
  </article>;
}

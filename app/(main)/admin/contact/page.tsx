import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperator } from "@/lib/admin";
import { sql } from "@/lib/db";
import { isUuid, validSupportMessage } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Demandes de contact", robots: { index: false } };
async function reply(form: FormData) {
  "use server";
  if (!(await isOperator())) throw new Error("Forbidden");
  const id = form.get("id"), answer = form.get("reply");
  if (!isUuid(id) || !validSupportMessage(answer)) throw new Error("Réponse invalide");
  await sql("UPDATE support_requests SET reply=$2,status='traite',updated_at=now() WHERE id=$1::uuid", [id,answer.trim()]);
  revalidatePath("/admin/contact");
}
export default async function ContactInbox() {
  if (!(await isOperator())) notFound();
  const rows = await sql("SELECT id,category,message,reply,status,created_at FROM support_requests ORDER BY (status='ouvert') DESC,created_at DESC LIMIT 100");
  return <article className="mx-auto max-w-3xl px-4 py-10 space-y-6"><h1 className="text-3xl font-bold">Demandes de contact</h1>
    <p>Les 100 demandes les plus récentes, avec les demandes ouvertes en premier. La réponse est consultable avec le code privé remis au demandeur.</p>
    {rows.map((row) => <section key={String(row.id)} className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">{String(row.category)} · {String(row.status)}</h2>
      <p className="text-sm">{String(row.id)}</p><p className="whitespace-pre-wrap break-words">{String(row.message)}</p>
      <form action={reply}><input type="hidden" name="id" value={String(row.id)} /><label className="block">Réponse<textarea name="reply" defaultValue={row.reply ? String(row.reply) : ""} className="block w-full border rounded-md p-3 my-2" rows={4} minLength={10} maxLength={5000} required /></label><button className="rounded-md border p-3">Publier la réponse et marquer traitée</button></form>
    </section>)}
    {!rows.length && <p>Aucune demande reçue.</p>}
  </article>;
}

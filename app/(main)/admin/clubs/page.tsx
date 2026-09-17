import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperator } from "@/lib/admin";
import { getAuthUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { transaction } from "@/lib/db/transaction";
import { isUuid } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Vérification des clubs", robots: { index: false } };
async function verify(form: FormData) {
  "use server";
  if (!(await isOperator())) throw new Error("Forbidden");
  const operator = await getAuthUser();
  const userId = form.get("userId"), clubId = form.get("clubId"), role = form.get("role");
  if (!operator || !isUuid(userId) || !isUuid(clubId) || !["coureur","responsable"].includes(String(role)) || form.get("confirmed") !== "yes") throw new Error("Vérification requise");
  await transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1::uuid FOR UPDATE", [userId]);
    await client.query(`UPDATE club_members SET role=$3,verified_at=now(),verified_by=$4
      WHERE user_id=$1::uuid AND club_id=$2::uuid AND verified_at IS NULL`, [userId,clubId,role,operator.id]);
  });
  revalidatePath("/admin/clubs"); revalidatePath("/club");
}
export default async function ReviewClubs() {
  if (!(await isOperator())) notFound();
  const rows = await sql(`SELECT m.user_id,m.club_id,c.name AS club,u.display_name FROM club_members m
    JOIN clubs c ON c.id=m.club_id JOIN users u ON u.id=m.user_id WHERE m.verified_at IS NULL ORDER BY c.name LIMIT 100`);
  return <article className="mx-auto max-w-3xl p-6 space-y-5"><h1 className="text-3xl font-bold">Vérifier les membres des clubs</h1>
    <p>Vérifie l’appartenance auprès d’une source indépendante. Le rôle responsable exige une confirmation du club ; un nom saisi ou une fiche de coureur sélectionnée ne suffit pas.</p>
    {rows.map((row) => <form action={verify} key={`${row.user_id}:${row.club_id}`} className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">{String(row.display_name ?? "Compte sans nom")} · {String(row.club)}</h2>
      <p className="text-sm break-all">Compte : {String(row.user_id)}</p>
      <input type="hidden" name="userId" value={String(row.user_id)} /><input type="hidden" name="clubId" value={String(row.club_id)} />
      <label className="block">Rôle confirmé<select name="role" className="block border p-2"><option value="coureur">Coureur</option><option value="responsable">Responsable des engagements</option></select></label>
      <label className="block"><input type="checkbox" name="confirmed" value="yes" required /> J’ai vérifié l’appartenance et le rôle auprès du club.</label>
      <button className="border rounded-md p-3">Valider l’accès au club</button>
    </form>)}
    {!rows.length && <p>Aucune demande en attente.</p>}
  </article>;
}

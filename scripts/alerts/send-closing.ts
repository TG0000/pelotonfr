/**
 * « Les engagements ferment jeudi soir. »
 *
 *   npx tsx scripts/alerts/send-closing.ts [--dry-run]
 *
 * Le licencié FFC ne s'engage pas lui-même : c'est le club, et la clôture
 * tombe le jeudi pour le dimanche. Un coureur qui a mis une course à son
 * calendrier — envisagée ou programmée — reçoit un mot deux jours avant que
 * la porte se ferme, avec les places restantes et qui du club y va déjà.
 * Une fois par course, jamais après la clôture.
 */

import { sendMail } from "../../lib/mail";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { toDateOnly } from "../../lib/date";
import { displayRaceName } from "../../lib/race-name";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const MAILER = Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
const FROM = process.env.ALERT_FROM_EMAIL ?? "PelotonFR <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pelotonfr.com";

interface Due {
  user_id: string;
  email: string;
  display_name: string | null;
  race_id: string;
  name: string;
  race_date: string;
  city: string | null;
  intent: string;
  entries_close_at: string;
  entries_engaged: number | null;
  entries_capacity: number | null;
  club_going: number | null;
  club_handled: boolean;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function whenFr(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Europe/Paris" });
  const h = d.toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", " h ");
  return `${day} à ${h.replace(/ h 00$/, " h")}`;
}

function dateFr(v: unknown): string {
  const iso = toDateOnly(v) ?? String(v);
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function render(d: Due): { subject: string; html: string; text: string } {
  const name = displayRaceName(d.name);
  const left =
    d.entries_capacity != null && d.entries_engaged != null
      ? Math.max(0, d.entries_capacity - d.entries_engaged)
      : null;
  const subject = `Engagements : ${name} ferme ${whenFr(d.entries_close_at)}`;
  const facts: string[] = [];
  facts.push(`${dateFr(d.race_date)}${d.city ? ` à ${d.city}` : ""}.`);
  if (left != null) facts.push(left > 0 ? `Il reste ${left} place${left > 1 ? "s" : ""}${d.entries_engaged ? ` (${d.entries_engaged} engagés)` : ""}.` : "C'est complet au compteur fédéral.");
  else if (d.entries_engaged) facts.push(`${d.entries_engaged} engagés déjà.`);
  if (d.club_handled) facts.push("Ton club a marqué la course comme engagée.");
  else if (d.club_going && d.club_going > 0) facts.push(`${d.club_going} du club y ${d.club_going > 1 ? "vont" : "va"} déjà.`);
  const call = d.club_handled
    ? "Vérifie que ton nom y est."
    : "C'est ton club qui engage, pas toi : préviens ton responsable ce soir.";

  const text = [subject, "", ...facts, "", call, "", `${SITE_URL}/course/${d.race_id}`, "", `Retirer la course de ton calendrier : ${SITE_URL}/ma-saison`].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">PelotonFR</p>
    <h1 style="font-size:20px;margin:0 0 12px;color:#111827;">${esc(name)}</h1>
    <p style="font-size:15px;color:#111827;margin:0 0 8px;"><b>Les engagements ferment ${esc(whenFr(d.entries_close_at))}.</b></p>
    ${facts.map((f) => `<p style="font-size:14px;color:#4b5563;margin:0 0 6px;">${esc(f)}</p>`).join("")}
    <p style="font-size:15px;color:#111827;margin:16px 0;">${esc(call)}</p>
    <p><a href="${SITE_URL}/course/${d.race_id}" style="font-size:14px;font-weight:600;color:#1d4ed8;">Voir la course</a></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:28px;"><a href="${SITE_URL}/ma-saison" style="color:#6b7280;">Ma saison</a></p>
  </div></body></html>`;
  return { subject, html, text };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !MAILER;
  const due = (await sql(
    `SELECT u.id AS user_id, u.email, u.display_name, f.intent,
            r.id AS race_id, r.name, r.race_date, r.city, r.entries_close_at,
            r.entries_engaged, r.entries_capacity,
            -- « y vont déjà » veut dire programmée, pas mise de côté : la
            -- distinction existe justement pour qu'un signet ne se lise pas
            -- comme un engagement, et c'est la phrase qui décide un coureur.
            (SELECT count(*) FROM user_favorites f2
              JOIN club_members m2 ON m2.verified_at IS NOT NULL AND m2.user_id = f2.user_id
              JOIN club_members m1 ON m1.verified_at IS NOT NULL AND m1.user_id = u.id AND m1.club_id = m2.club_id
             WHERE f2.race_id = r.id AND f2.user_id <> u.id AND f2.intent = 'programmee') AS club_going,
            EXISTS (SELECT 1 FROM club_entries ce
                      JOIN club_members m1 ON m1.verified_at IS NOT NULL AND m1.user_id = u.id AND m1.club_id = ce.club_id
                     WHERE ce.race_id = r.id) AS club_handled
       FROM user_favorites f
       JOIN users u ON u.id = f.user_id
       JOIN races r ON r.id = f.race_id
      WHERE u.email IS NOT NULL
        AND r.entries_close_at IS NOT NULL
        AND r.entries_close_at > now()
        AND r.entries_close_at <= now() + INTERVAL '54 hours'
        AND NOT r.is_cancelled
        AND NOT EXISTS (SELECT 1 FROM closing_notices n WHERE n.user_id = u.id AND n.race_id = r.id)
      ORDER BY r.entries_close_at, u.email`
  )) as unknown as Due[];

  if (due.length === 0) {
    console.log("Aucune clôture à annoncer.");
    return;
  }
  console.log(`${due.length} avis de clôture à envoyer${dryRun ? " (à blanc)" : ""}.`);
  let sent = 0;
  for (const d of due) {
    const { subject, html, text } = render(d);
    console.log(`  [recipient] ${subject}`);
    if (dryRun) continue;
    try {
      await sendMail({ to: d.email, subject, html, text, from: FROM });
    } catch (err) {
      console.error(`  envoi refusé : ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    await sql(`INSERT INTO closing_notices (user_id, race_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`, [d.user_id, d.race_id]);
    sent++;
  }
  console.log(dryRun ? "À blanc, rien d'envoyé." : `${sent} avis envoyé(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

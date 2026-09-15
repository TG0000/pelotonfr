/**
 * Envoyer un e-mail, par le service qui peut le livrer.
 *
 * Resend, sans domaine vérifié, ne livre qu'à l'adresse du compte — le lien
 * de connexion, les alertes et les rappels de club n'atteignaient personne
 * d'autre. Brevo vérifie une simple adresse d'expéditeur et livre à tous ;
 * il passe devant dès que sa clé est posée. Resend reste derrière, pour le
 * jour où un domaine existera.
 */

import { isPlaceholderEmail } from "@/lib/strava/client";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

const DEFAULT_FROM = "PelotonFR <onboarding@resend.dev>";

function parseFrom(from: string): { name: string; email: string } {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return m ? { name: m[1].trim() || "PelotonFR", email: m[2] } : { name: "PelotonFR", email: from };
}

export async function sendMail(mail: Mail): Promise<void> {
  // Un compte né sur Strava porte une adresse fictive tant que le coureur
  // n'en a pas donné une vraie : rien ne part vers elle.
  if (isPlaceholderEmail(mail.to)) throw new Error("MAIL_RECIPIENT_UNVERIFIED");

  const from = mail.from ?? process.env.ALERT_FROM_EMAIL ?? DEFAULT_FROM;

  const brevo = process.env.BREVO_API_KEY;
  if (brevo) {
    const sender = parseFrom(process.env.BREVO_FROM_EMAIL ?? from);
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "api-key": brevo, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(mail.text)}</pre>`,
      }),
    });
    if (!res.ok) throw new Error(`MAIL_PROVIDER_BREVO_${res.status}`);
    return;
  }

  const resend = process.env.RESEND_API_KEY;
  if (!resend) {
    throw new Error("MAIL_NOT_CONFIGURED");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`MAIL_PROVIDER_RESEND_${res.status}`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

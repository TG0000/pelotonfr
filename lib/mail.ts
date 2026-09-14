/**
 * Envoyer un e-mail, par le service qui peut le livrer.
 *
 * Resend, sans domaine vérifié, ne livre qu'à l'adresse du compte — le lien
 * de connexion, les alertes et les rappels de club n'atteignaient personne
 * d'autre. Brevo vérifie une simple adresse d'expéditeur et livre à tous ;
 * il passe devant dès que sa clé est posée. Resend reste derrière, pour le
 * jour où un domaine existera.
 */

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
  const from = mail.from ?? process.env.ALERT_FROM_EMAIL ?? DEFAULT_FROM;

  const brevo = process.env.BREVO_API_KEY;
  if (brevo) {
    const sender = parseFrom(process.env.BREVO_FROM_EMAIL ?? from);
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap">${mail.text}</pre>`,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  const resend = process.env.RESEND_API_KEY;
  if (!resend) {
    console.log(`[mail] pas de service configuré — à ${mail.to} : ${mail.subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Le lien de connexion, par e-mail.
 *
 * Un seul message, court : le lien, sa durée, et qui l'a envoyé. Resend porte
 * déjà les alertes et les rappels de club ; il porte celui-ci.
 */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Sans clé, le lien s'affiche dans les journaux : c'est le cas du poste
    // de développement, jamais celui de la production.
    console.log(`[auth] lien de connexion pour ${email} : ${url}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM ?? "PelotonFR <onboarding@resend.dev>",
      to: email,
      subject: "Votre lien de connexion à PelotonFR",
      text:
        `Bonjour,\n\nVoici votre lien pour vous connecter à PelotonFR :\n${url}\n\n` +
        `Il est valable 15 minutes. Si vous n'avez rien demandé, ignorez ce message.\n\nPelotonFR`,
      html:
        `<p>Bonjour,</p><p>Voici votre lien pour vous connecter à PelotonFR :</p>` +
        `<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">Me connecter</a></p>` +
        `<p style="color:#64748b;font-size:13px">Il est valable 15 minutes. Si vous n'avez rien demandé, ignorez ce message.</p>`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

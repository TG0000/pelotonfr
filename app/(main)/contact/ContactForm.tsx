"use client";
import { useState } from "react";
import { submitContact, readContact } from "./actions";

const field = "block w-full rounded-md border bg-background p-3 mt-1";
export function ContactForm() {
  const [receipt, setReceipt] = useState<{ id: string; code: string } | null>(null);
  const [ticket, setTicket] = useState<{ message: string; reply: string | null; status: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="space-y-10">
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const form = new FormData(event.currentTarget);
      try {
        const result = await submitContact(String(form.get("category")), String(form.get("message")));
        if (result.error) setMessage(result.error);
        else if (result.id && result.code) setReceipt({ id: result.id, code: result.code });
      } catch { setMessage("La demande n’a pas pu être enregistrée. Réessaie dans un instant."); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-semibold">Une nouvelle demande</h2>
      <label className="block">Sujet<select name="category" className={field} required>
        <option value="support">Question ou problème</option><option value="confidentialite">Mes données personnelles</option><option value="club">Vérifier mon rôle dans un club</option>
      </select></label>
      <label className="block">Ton message<textarea name="message" rows={6} minLength={10} maxLength={5000} className={field} required /></label>
      <p className="text-sm text-muted-foreground">Indique la page concernée et les informations utiles. N’envoie ni mot de passe, ni copie de pièce d’identité. Tu pourras lire la réponse ici avec le code remis après l’envoi.</p>
      <button disabled={busy || Boolean(receipt)} className="rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50">{busy ? "Enregistrement…" : "Envoyer la demande"}</button>
    </form>
    {receipt && <section role="status" className="rounded-lg border p-4 space-y-2 break-all">
      <h2 className="font-semibold">Demande enregistrée</h2><p>Conserve ces deux informations pour consulter la réponse. Le code ne pourra pas être récupéré.</p>
      <p>Référence : <code>{receipt.id}</code></p><p>Code privé : <code>{receipt.code}</code></p>
    </section>}
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage(""); setTicket(null);
      const form = new FormData(event.currentTarget);
      try {
        const result = await readContact(String(form.get("id")).trim(), String(form.get("code")).trim());
        if (result.error) setMessage(result.error);
        else if (result.ticket) setTicket(result.ticket);
      } catch { setMessage("Le suivi est indisponible. Réessaie dans un instant."); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-semibold">Suivre ma demande</h2>
      <label className="block">Référence<input name="id" defaultValue={receipt?.id} className={field} required /></label>
      <label className="block">Code privé<input name="code" type="password" autoComplete="off" defaultValue={receipt?.code} className={field} required /></label>
      <button disabled={busy} className="rounded-md border px-4 py-3">Consulter la réponse</button>
    </form>
    {message && <p role="alert">{message}</p>}
    {ticket && <section role="status" className="rounded-lg border p-4 space-y-3"><h2 className="font-semibold">{ticket.status === "traite" ? "Demande traitée" : "En attente de réponse"}</h2><p className="whitespace-pre-wrap break-words">{ticket.message}</p><p className="whitespace-pre-wrap break-words">{ticket.reply ?? "La réponse apparaîtra ici après traitement."}</p></section>}
  </div>;
}

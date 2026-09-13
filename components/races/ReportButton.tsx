"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Flag } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { REPORT_KINDS } from "@/lib/db/queries/reports";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * « Quelque chose manque ou est faux » — le lecteur nous prévient.
 *
 * Le coureur qui a reconnu le circuit, l'organisateur qui voit un mauvais
 * horaire : ils savent avant nous. Un choix, un mot si besoin, un contact
 * si on veut être recontacté. Pas de compte nécessaire.
 */
export function ReportButton({ raceId }: { raceId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send() {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raceId, kind, message, contact, page: pathname }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Le signalement n'est pas parti, réessayez.");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setError("Le signalement n'est pas parti, réessayez.");
      setState("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setState("idle"); setKind(""); setMessage(""); setError(""); }
      }}
    >
      <DialogTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}
      >
        <Flag className="size-3.5" />
        Une info manque ou est fausse ?
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nous prévenir</DialogTitle>
          <DialogDescription>
            Vous connaissez cette course mieux que nos collecteurs. Dites-nous ce qui ne va pas, on corrige.
          </DialogDescription>
        </DialogHeader>

        {state === "sent" ? (
          <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            Merci, c&apos;est noté. On regarde et on corrige la fiche.
          </p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quoi
              </legend>
              {REPORT_KINDS.map((k) => (
                <label key={k.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                  <input
                    type="radio" name="kind" value={k.value}
                    checked={kind === k.value}
                    onChange={() => setKind(k.value)}
                    className="accent-primary"
                  />
                  {k.label}
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Précisions {kind === "autre" ? "" : "(facultatif)"}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Le bon circuit, le bon horaire, un lien…"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pour vous répondre (facultatif)
              </span>
              <input
                type="email"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="votre@email.fr"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={!kind || state === "sending"}
              className={cn(buttonVariants({ size: "sm" }), "self-end")}
            >
              {state === "sending" ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

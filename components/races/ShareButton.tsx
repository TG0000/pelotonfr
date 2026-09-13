"use client";

import { useState } from "react";
import { useUser } from "@/components/auth";
import { Check, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

/**
 * Montrer une course à quelqu'un.
 *
 * Un coéquipier, un parent, un pote qui hésite : on s'envoie une course
 * comme on s'envoie une adresse. Sur téléphone, la feuille de partage du
 * système fait tout — WhatsApp, Messages, Mail, le reste. Ailleurs, un petit
 * menu : copier le lien, WhatsApp, e-mail.
 *
 * Le lien porte le prénom de celui qui partage, quand il est connecté : la
 * page dit alors « Théo vous propose cette course » et offre de l'ajouter à
 * sa saison. C'est ce qui fait qu'un lien reçu ressemble à une invitation,
 * pas à une adresse.
 */
export function ShareButton({
  raceId,
  title,
  when,
}: {
  raceId: string;
  title: string;
  /** « dimanche 20 septembre à Saint-Denis-de-Gastines » */
  when: string;
}) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = () => {
    const base = `${window.location.origin}/course/${raceId}`;
    const from = user?.firstName?.trim();
    return from ? `${base}?de=${encodeURIComponent(from)}` : base;
  };
  const text = `${title} — ${when}`;

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url: url() });
        return;
      } catch {
        // Feuille refermée sans partager : rien à faire.
        return;
      }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiez le lien :", url());
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={share}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Share2 className="size-3.5" />
        Partager
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface-1 p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={copy}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            {copied ? <Check className="size-4 text-accent" /> : <Link2 className="size-4" />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          <a
            role="menuitem"
            href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url()}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
          <a
            role="menuitem"
            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url()}`)}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
          >
            <Mail className="size-4" />
            E-mail
          </a>
        </div>
      )}
    </div>
  );
}

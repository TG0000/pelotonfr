"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Le bouton Strava, à la couleur de Strava.
 *
 * L'orange est le leur, pas le nôtre — comme le « G » de Google, un bouton
 * qui ne ressemble pas à la marque est un bouton qu'on hésite à cliquer.
 * Strava demande d'ailleurs que « Connect with Strava » garde cette forme.
 *
 * Un seul bouton pour deux situations : personne n'est connecté, alors Strava
 * crée le compte ; quelqu'un l'est déjà, alors Strava se rattache au sien.
 * Dans les deux cas on revient sur `callbackURL` avec les sorties à relier.
 */
export function StravaButton({
  callbackURL = "/profil?strava=ok",
  label,
  className,
  size = "md",
}: {
  callbackURL?: string;
  label?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  const { data } = useSession();
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(data?.user);
  const text = label ?? (signedIn ? "Connecter Strava" : "Continuer avec Strava");

  async function go() {
    setBusy(true);
    const res = signedIn
      ? await authClient.linkSocial({ provider: "strava", callbackURL })
      : await authClient.signIn.social({ provider: "strava", callbackURL });
    // En cas de succès le navigateur part vers Strava ; on ne revient ici
    // qu'en cas d'échec.
    if (res.error) setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 rounded-full font-semibold text-white transition-colors",
        "bg-[#fc4c02] hover:bg-[#e34402] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4c02]/50 disabled:opacity-70",
        size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm",
        className
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" className={size === "lg" ? "size-5" : "size-4"} aria-hidden="true" fill="currentColor">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
      )}
      {text}
    </button>
  );
}

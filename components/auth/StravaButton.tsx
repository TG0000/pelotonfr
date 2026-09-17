"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** Strava remains recognizable; the darker orange keeps small white text readable. */
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
  const [error,setError] = useState("");
  const signedIn = Boolean(data?.user);
  const text = label ?? (signedIn ? "Connecter Strava" : "Continuer avec Strava");

  async function go() {
    setBusy(true); setError("");
    try {
      const res = signedIn
        ? await authClient.linkSocial({ provider: "strava", callbackURL })
        : await authClient.signIn.social({ provider: "strava", callbackURL });
      if (res.error) throw new Error();
    } catch { setError("La connexion Strava a échoué. Réessaie ou utilise ton e-mail."); }
    finally { setBusy(false); }
  }

  return (
    <>
    <button
      type="button"
      onClick={go}
      disabled={busy}
      aria-busy={busy}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 rounded-full font-semibold text-white transition-colors",
        "bg-[#c63e02] hover:bg-[#a63200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4c02]/50 disabled:opacity-70",
        size === "lg" ? "min-h-12 px-6 py-2 text-base" : "min-h-11 px-3 py-2 text-sm",
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
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}

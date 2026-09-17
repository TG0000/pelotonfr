"use client";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function OAuthButton({ provider, callbackURL, className, children }: {
  provider: "google" | "apple"; callbackURL: string; className: string; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function connect() {
    setBusy(true); setError(false);
    try {
      const result = await authClient.signIn.social({ provider, callbackURL });
      if (result.error) throw new Error("Connection failed");
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" onClick={connect} disabled={busy} aria-busy={busy} className={className}>
      {busy ? <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" /> : null}{children}
    </button>
    {error ? <p role="alert" className="mt-2 text-sm text-destructive">La connexion {provider === "google" ? "Google" : "Apple"} a échoué. Réessaie ou utilise ton e-mail.</p> : null}
  </div>;
}

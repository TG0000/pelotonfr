"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

/**
 * L'adresse qui manque à un compte né sur Strava.
 *
 * Strava ne la donne pas ; sans elle, ni alerte de clôture ni rappel de club
 * ne peuvent partir. On la demande une fois, ici, sans bloquer le reste.
 */
export function EmailPrompt() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await authClient.changeEmail({ newEmail: email.trim() });
    if (res.error) {
      setError(res.error.message ?? "L'adresse n'a pas été enregistrée, réessayez.");
      setState("error");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
        Adresse enregistrée : <span className="font-medium">{email}</span>. Les alertes
        et rappels de club partiront vers elle.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Mail className="size-4 text-primary" />
        Une adresse pour les alertes
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Strava ne nous transmet pas votre e-mail. Sans lui, l&apos;alerte de clôture des
        engagements et le rappel de club n&apos;ont personne à prévenir.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "sending" || !email}
          className={cn(buttonVariants({ size: "sm" }), "sm:w-auto")}
        >
          {state === "sending" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  );
}

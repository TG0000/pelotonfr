"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { authClient, useSession, signOut } from "@/lib/auth-client";
import { GoogleButton } from "./GoogleButton";
import { StravaButton } from "./StravaButton";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Les boutons de compte, sous les noms que le code utilisait déjà.
 *
 * `SignInButton` et `SignUpButton` ouvrent la même chose : un champ e-mail,
 * un lien reçu, connecté — un compte se crée au premier lien, il n'y a pas
 * d'inscription à part. `UserButton` est l'avatar et son menu. `useAuth` et
 * `useUser` disent qui est là.
 */

export function useAuth(): { isSignedIn: boolean; isLoaded: boolean } {
  const { data, isPending } = useSession();
  return { isSignedIn: Boolean(data?.user), isLoaded: !isPending };
}

export function useUser(): { user: { firstName: string | null; email: string } | null } {
  const { data } = useSession();
  if (!data?.user) return { user: null };
  const name = data.user.name?.trim() || "";
  return { user: { firstName: name ? name.split(/\s+/)[0] : null, email: data.user.email } };
}

export function SignInForm({ callbackURL = "/ma-saison" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const res = await authClient.signIn.magicLink({ email: email.trim(), callbackURL });
    if (res.error) {
      setError(res.error.message ?? "Le lien n'est pas parti, réessayez.");
      setState("error");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
        Un lien vient de partir vers <span className="font-medium">{email}</span>. Ouvrez-le : vous
        serez connecté. Il est valable 15 minutes.
      </p>
    );
  }

  const google = Boolean(process.env.NEXT_PUBLIC_GOOGLE_SIGNIN);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {/* Strava d'abord : c'est là que sont les coureurs, et le compte se
          crée avec les sorties déjà reliées. */}
      <StravaButton callbackURL="/profil?strava=ok" className="w-full" />
      <p className="text-[11px] text-muted-foreground">
        Vos sorties sont reliées à vos courses ; nous ne publions rien sur Strava.
      </p>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou par e-mail
        <span className="h-px flex-1 bg-border" />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Votre e-mail
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending" || !email}
        className={cn(buttonVariants({ size: "sm" }), "w-full")}
      >
        {state === "sending" ? "Envoi…" : "Recevoir mon lien de connexion"}
      </button>
      {google && (
        <>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton callbackURL={callbackURL} />
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Pas de mot de passe : un lien par e-mail, et un compte se crée au premier.
      </p>
    </form>
  );
}

function SignInDialog({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Dialog>
      {/* Base UI compose par `render` : l'élément reçu devient le déclencheur. */}
      <DialogTrigger
        render={React.isValidElement(children) ? (children as React.ReactElement) : <button type="button">{children}</button>}
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Pour construire votre saison et retrouver vos courses.</DialogDescription>
        </DialogHeader>
        <SignInForm />
      </DialogContent>
    </Dialog>
  );
}

export function SignInButton({ children }: { children: React.ReactNode; mode?: string }) {
  return <SignInDialog title="Se connecter">{children}</SignInDialog>;
}

export function SignUpButton({ children }: { children: React.ReactNode; mode?: string }) {
  return <SignInDialog title="Créer un compte">{children}</SignInDialog>;
}

export function UserButton() {
  const { data } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!data?.user) return null;
  const initial = (data.user.name?.trim() || data.user.email).charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={data.user.email}
        className="grid size-8 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface-1 p-1 shadow-lg">
          <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{data.user.email}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); router.push("/profil"); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <UserRound className="size-4" /> Mon profil
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => { setOpen(false); await signOut(); router.refresh(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <LogOut className="size-4" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

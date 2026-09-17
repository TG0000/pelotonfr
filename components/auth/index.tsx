"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { authClient, useSession, signOut } from "@/lib/auth-client";
import { AppleButton } from "./AppleButton";
import { GoogleButton } from "./GoogleButton";
import { StravaButton } from "./StravaButton";
import { buttonVariants } from "@/lib/button-variants";
import type { VariantProps } from "class-variance-authority";
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

export function useAuth(): { isSignedIn: boolean; isLoaded: boolean; userId: string | null } {
  const { data, isPending } = useSession();
  return { isSignedIn: Boolean(data?.user), isLoaded: !isPending, userId: data?.user.id ?? null };
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
    try {
      const res = await authClient.signIn.magicLink({ email: email.trim(), callbackURL });
      if (res.error) throw new Error();
      setState("sent");
    } catch {
      setError("Le lien n’a pas pu être envoyé. Vérifie l’adresse et réessaie.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
        Un lien vient de partir vers <span className="font-medium">{email}</span>. Ouvrez-le : vous
        serez connecté. Il est valable 15 minutes.
        <button type="button" className="block mt-2 underline" onClick={() => setState("idle")}>Corriger l’adresse ou renvoyer le lien</button>
      </div>
    );
  }

  const google = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "true";
  const apple = process.env.NEXT_PUBLIC_APPLE_SIGNIN === "true";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {google ? <GoogleButton callbackURL={callbackURL} /> : null}
      {apple ? <AppleButton callbackURL={callbackURL} /> : null}
      {process.env.NEXT_PUBLIC_STRAVA_SIGNIN === "true" ? <section aria-label="Connexion Strava" className="rounded-xl border border-border bg-background p-3">
        <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm font-semibold">Avec Strava</span><span className="rounded-full bg-surface-2 px-2 py-1 text-xs text-muted-foreground">Facultatif</span></div>
        <StravaButton callbackURL={callbackURL} className="w-full" />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Retrouve ensuite tes sorties dans ta saison. Tu choisis quand les importer et sur quelle période.</p>
        <details className="mt-3 border-t pt-3 text-sm">
          <summary className="cursor-pointer font-semibold underline-offset-4 hover:underline">Quelles données sont utilisées ?</summary>
          <ul className="mt-3 space-y-2 pl-4 list-disc text-muted-foreground leading-relaxed">
            <li>Accès en lecture à ton profil et à tes activités, y compris privées selon les autorisations accordées.</li>
            <li>Aucune activité créée, modifiée ou publiée sur Strava.</li>
            <li>Tu peux déconnecter Strava et supprimer les activités importées depuis ton profil.</li>
          </ul>
          <a href="/confidentialite" className="mt-3 inline-block underline">En savoir plus sur tes données</a>
        </details>
      </section> : null}
      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />{google || apple || process.env.NEXT_PUBLIC_STRAVA_SIGNIN === "true" ? "ou avec ton e-mail" : "Avec ton e-mail"}<span className="h-px flex-1 bg-border" />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ton e-mail
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending" || !email}
        className={cn(buttonVariants({ size: "sm" }), "min-h-11 w-full")}
      >
        {state === "sending" ? "Envoi…" : "Recevoir mon lien de connexion"}
      </button>
      <p className="text-[11px] text-muted-foreground">
        En créant un compte, tu acceptes les <a href="/cgu" className="underline">CGU</a>. Consulte aussi la <a href="/confidentialite" className="underline">confidentialité</a>.
      </p>
    </form>
  );
}

type TriggerStyle = {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
  callbackURL?: string;
};

function SignInDialog({
  children,
  title,
  variant,
  size = "sm",
  className,
  callbackURL,
}: { children: React.ReactNode; title: string } & TriggerStyle) {
  /* Le déclencheur est rendu ici, en bouton natif habillé comme `Button`.
     Confier un `<Button>` tout fait à Base UI par `render` marchait dans le
     navigateur mais pas au rendu serveur : depuis une page serveur,
     l'élément arrive comme référence, Base UI l'emboîte dans son propre
     bouton, et l'hydratation refait tout — bouton vide un instant, erreur
     en console sur chaque page. Une page serveur passe donc le libellé et
     la variante en props ; un composant client peut encore passer un
     élément, dont on ne garde que le libellé et les classes. */
  const el = React.isValidElement(children)
    ? (children as React.ReactElement<{ children?: React.ReactNode } & TriggerStyle>)
    : null;
  const label = el ? el.props.children : children;
  /* Un bouton natif reçu tel quel garde tous ses attributs (titre, aria). */
  const native = el && typeof el.type === "string" ? (el.props as Record<string, unknown>) : null;
  const { children: _omit, ...nativeProps } = native ?? {};
  void _omit;
  const classes = native
    ? (native.className as string | undefined)
    : cn(
        buttonVariants({
          variant: el?.props.variant ?? variant,
          size: el?.props.size ?? size,
          className: el?.props.className ?? className,
        })
      );
  return (
    <Dialog>
      <DialogTrigger {...nativeProps} className={classes}>
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Retrouve ta saison et les courses de ton club.</DialogDescription>
        </DialogHeader>
        <SignInForm callbackURL={callbackURL} />
      </DialogContent>
    </Dialog>
  );
}

export function SignInButton({
  children,
  ...style
}: { children: React.ReactNode; mode?: string } & TriggerStyle) {
  return <SignInDialog title="Se connecter" {...style}>{children}</SignInDialog>;
}

export function SignUpButton({
  children,
  ...style
}: { children: React.ReactNode; mode?: string } & TriggerStyle) {
  return <SignInDialog title="Créer un compte" {...style}>{children}</SignInDialog>;
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

import { safeReturnPath } from "@/lib/validation";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { SignInForm } from "@/components/auth";

export const metadata: Metadata = { title: "Se connecter", robots: { index: false, follow: false } };

/** Un champ, un lien reçu, connecté. Le compte se crée au premier lien. */
export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ vers?: string }>;
}) {
  const { vers } = await searchParams;
  const callbackURL = safeReturnPath(vers, "/ma-saison");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-5 sm:p-8">
        <Link href="/" className="mb-4 flex items-center gap-2">
          <Logo className="size-6" />
          <span className="font-semibold">PelotonFR</span>
        </Link>
        <h1 className="mb-2 font-heading text-4xl font-bold">Se connecter</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Retrouve ta saison, les courses de ton club et tes alertes. Choisis simplement ta façon de te connecter.
        </p>
        <SignInForm callbackURL={callbackURL} />
      </div>
    </main>
  );
}

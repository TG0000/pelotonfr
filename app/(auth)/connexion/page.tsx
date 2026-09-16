import { safeReturnPath } from "@/lib/validation";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { SignInForm } from "@/components/auth";

export const metadata: Metadata = { title: "Se connecter" };

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
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6">
        <Link href="/" className="mb-4 flex items-center gap-2">
          <Logo className="size-6" />
          <span className="font-semibold">PelotonFR</span>
        </Link>
        <h1 className="mb-1 text-xl font-bold">Se connecter</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Pour construire votre saison, suivre votre club et recevoir vos alertes.
        </p>
        <SignInForm callbackURL={callbackURL} />
      </div>
    </main>
  );
}

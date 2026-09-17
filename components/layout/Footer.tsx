import { CookiePreferencesButton } from "./CookieConsent";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { DataFreshness } from "./DataFreshness";

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap justify-center items-center gap-2 text-sm text-muted-foreground">
            <Logo className="size-5" />
            <span className="font-semibold text-foreground">PelotonFR</span>
            <span>— Le dimanche commence ici.</span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-3 text-xs text-muted-foreground">
            <span>Données : FFC · FSGT · UFOLEP</span>
            <Suspense fallback={null}>
              <DataFreshness />
            </Suspense>
            <Link href="/departement" className="hover:text-foreground transition-colors">
              Par département
            </Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link href="/cgu" className="hover:text-foreground">CGU</Link>
            <CookiePreferencesButton />
            <Link href="/mentions-legales" className="hover:text-foreground transition-colors">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:text-foreground transition-colors">
              Confidentialité
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

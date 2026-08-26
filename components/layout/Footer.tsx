import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { DataFreshness } from "./DataFreshness";

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Logo className="size-5" />
            <span className="font-semibold text-foreground">PelotonFR</span>
            <span>— Toutes les courses cyclistes en France</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Données : FFC · FSGT · UFOLEP</span>
            <Suspense fallback={null}>
              <DataFreshness />
            </Suspense>
            <Link href="/mentions-legales" className="hover:text-foreground transition-colors">
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

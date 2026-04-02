import Link from "next/link";
import { Bike } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bike className="size-4 text-primary" />
            <span className="font-semibold text-foreground">PelotonFR</span>
            <span>— Toutes les courses cyclistes en France</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Données: FFC · FSGT · UFOLEP</span>
            <Link href="/mentions-legales" className="hover:text-foreground transition-colors">
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

/**
 * Le chemin le plus court vers ses propres courses.
 *
 * Le calendrier retient la dernière recherche — fédération, catégories,
 * rayon — et la rejoue quand on y revient. L'accueil, lui, est une page
 * statique qui ne peut rien en savoir côté serveur : ce lien lit la mémoire
 * du navigateur et mène droit au calendrier filtré. Sans recherche retenue,
 * il n'existe pas.
 */

const STORAGE_KEY = "pelotonfr.filters";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSaved(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function SavedSearchLink({ className }: { className?: string }) {
  // Lu à la source, jamais recopié dans un état : sur le serveur, rien.
  const saved = useSyncExternalStore(subscribe, readSaved, () => "");
  if (!saved) return null;

  const params = new URLSearchParams(saved);
  const count = ["fed", "disc", "cat", "lieu", "q"].reduce(
    (n, key) => n + params.getAll(key).length,
    0
  );
  if (count === 0 && !params.has("lat")) return null;

  return (
    <Link
      href={`/calendrier?${saved}`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5", className)}
    >
      Mes courses
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {params.has("lat") ? "près de moi" : `${count} filtre${count > 1 ? "s" : ""}`}
      </span>
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

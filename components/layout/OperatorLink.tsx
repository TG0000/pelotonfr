"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useAuth } from "@/components/auth";

/**
 * Le lien vers le tableau de bord, pour l'opérateur seul.
 *
 * Demandé au serveur après le rendu plutôt que lu dans la mise en page : lire
 * la session dans la mise en page rendait chaque page dynamique, accueil
 * compris — 1,6 s au lieu de 0,15 s en cache, pour un lien qu'un seul lecteur
 * verra jamais.
 */
export function OperatorLink() {
  const { isSignedIn } = useAuth();
  const [operator, setOperator] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let live = true;
    fetch("/api/me/operator")
      .then((r) => (r.ok ? r.json() : { operator: false }))
      .then((d: { operator?: boolean }) => {
        if (live) setOperator(Boolean(d.operator));
      })
      .catch(() => {
        if (live) setOperator(false);
      });
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  // Déconnecté, le lien disparaît sans qu'un effet ait à le dire.
  if (!isSignedIn || !operator) return null;
  return (
    <Link
      href="/admin"
      className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-accent hover:bg-surface-2 sm:inline-flex"
    >
      <Activity className="size-4" />
      Tableau de bord
    </Link>
  );
}

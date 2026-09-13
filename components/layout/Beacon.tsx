"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Dit au serveur qu'une page est lue — le chemin, rien d'autre.
 *
 * `sendBeacon` part même quand on quitte la page, et ne bloque rien. Une
 * page par changement d'adresse : pas de rafale au moindre re-rendu.
 */
export function Beacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const body = JSON.stringify({ path: pathname });
    try {
      if (!navigator.sendBeacon?.("/api/beacon", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/beacon", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch {
      // Pas de balise, pas de drame.
    }
  }, [pathname]);
  return null;
}

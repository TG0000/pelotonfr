"use client";

import { useEffect, useRef } from "react";
import { maplibregl } from "@/lib/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LiveCity } from "@/lib/db/queries/reports";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * D'où le site est lu, en ce moment.
 *
 * Un point par commune déduite par l'hébergeur, gros comme le nombre de
 * vues : la France s'allume là où les coureurs regardent le calendrier.
 * Ni adresse ni identifiant derrière un point — une commune et un chiffre.
 */
export function LiveMap({ cities }: { cities: LiveCity[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [2.4, 46.6],
      zoom: 4.6,
      attributionControl: { compact: true },
      interactive: true,
    });

    map.on("load", () => {
      map.addSource("lecteurs", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: cities
            .filter((c) => c.lat != null && c.lng != null)
            .map((c) => ({
              type: "Feature",
              properties: { views: c.views, city: c.city },
              geometry: { type: "Point", coordinates: [c.lng!, c.lat!] },
            })),
        },
      });
      map.addLayer({
        id: "lecteurs-halo",
        type: "circle",
        source: "lecteurs",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "views"], 1, 10, 50, 28],
          "circle-color": "#f5c400",
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "lecteurs",
        type: "circle",
        source: "lecteurs",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "views"], 1, 4, 50, 12],
          "circle-color": "#f5c400",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "lecteurs-noms",
        type: "symbol",
        source: "lecteurs",
        layout: {
          "text-field": ["get", "city"],
          "text-size": 11,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: { "text-color": "#334155", "text-halo-color": "#ffffff", "text-halo-width": 1 },
      });
    });

    return () => map.remove();
    // La carte se construit une fois ; les villes changent avec le rendu serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className="h-72 w-full overflow-hidden rounded-lg border border-border" />;
}

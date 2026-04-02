"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import type { Race, RaceFilters } from "@/types";
import { FRANCE_CENTER, FRANCE_ZOOM } from "@/lib/constants";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RaceMapProps {
  initialRaces: Race[];
  filters: Partial<RaceFilters>;
  userLocation?: { lat: number; lng: number } | null;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const FED_COLORS: Record<string, string> = {
  ffc: "#3b82f6",
  fsgt: "#22c55e",
  ufolep: "#f97316",
};

function racesToGeoJSON(races: Race[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: races
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [r.lng!, r.lat!],
        },
        properties: {
          id: r.id,
          name: r.name,
          city: r.city,
          raceDate: r.raceDate,
          discipline: r.discipline,
          federationSlug: r.federationSlug,
          color: FED_COLORS[r.federationSlug] ?? "#6366f1",
        },
      })),
  };
}

export function RaceMap({ initialRaces, filters, userLocation }: RaceMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const router = useRouter();
  const [mapReady, setMapReady] = useState(false);

  const initMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: userLocation
        ? [userLocation.lng, userLocation.lat]
        : FRANCE_CENTER,
      zoom: userLocation ? 9 : FRANCE_ZOOM,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.current.on("load", () => {
      setMapReady(true);
    });
  }, [userLocation]);

  useEffect(() => {
    initMap();
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [initMap]);

  // Update race data
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const geoJSON = racesToGeoJSON(initialRaces);

    // Remove existing layers/sources
    ["race-clusters", "cluster-count", "race-points"].forEach((layer) => {
      if (map.current!.getLayer(layer)) map.current!.removeLayer(layer);
    });
    if (map.current.getSource("races")) map.current.removeSource("races");

    map.current.addSource("races", {
      type: "geojson",
      data: geoJSON,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 50,
    });

    // Cluster circles
    map.current.addLayer({
      id: "race-clusters",
      type: "circle",
      source: "races",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#3b82f6",
          10, "#f97316",
          50, "#ef4444",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          18,
          10, 24,
          50, 30,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Cluster count labels
    map.current.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "races",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Bold"],
        "text-size": 13,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // Individual race points
    map.current.addLayer({
      id: "race-points",
      type: "circle",
      source: "races",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Click on cluster → zoom in
    map.current.on("click", "race-clusters", async (e) => {
      const features = map.current!.queryRenderedFeatures(e.point, { layers: ["race-clusters"] });
      const clusterId = features[0]?.properties?.cluster_id as number;
      if (clusterId == null) return;
      try {
        const zoom = await (map.current!.getSource("races") as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.current!.easeTo({ center: coords, zoom });
      } catch {
        // ignore
      }
    });

    // Click on individual race → show popup
    map.current.on("click", "race-points", (e) => {
      if (!e.features?.[0]) return;
      const props = e.features[0].properties as {
        id: string;
        name: string;
        city: string;
        raceDate: string;
        federationSlug: string;
        discipline: string;
      };
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      const dateFormatted = format(new Date(props.raceDate + "T12:00:00Z"), "d MMM yyyy", { locale: fr });

      const popup = new maplibregl.Popup({ offset: 12, maxWidth: "240px" })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family: system-ui; padding: 4px;">
            <div style="font-weight:600; margin-bottom:4px; font-size:13px; line-height:1.3">${props.name}</div>
            <div style="color:#6b7280; font-size:12px; margin-bottom:2px">📅 ${dateFormatted}</div>
            <div style="color:#6b7280; font-size:12px; margin-bottom:8px">📍 ${props.city}</div>
            <a href="/course/${props.id}" style="display:inline-block; background:#3b82f6; color:white; font-size:11px; padding:4px 10px; border-radius:4px; text-decoration:none; font-weight:500">
              Voir les détails →
            </a>
          </div>`
        )
        .addTo(map.current!);
    });

    // Cursor changes
    map.current.on("mouseenter", "race-points", () => {
      map.current!.getCanvas().style.cursor = "pointer";
    });
    map.current.on("mouseleave", "race-points", () => {
      map.current!.getCanvas().style.cursor = "";
    });
    map.current.on("mouseenter", "race-clusters", () => {
      map.current!.getCanvas().style.cursor = "pointer";
    });
    map.current.on("mouseleave", "race-clusters", () => {
      map.current!.getCanvas().style.cursor = "";
    });
  }, [mapReady, initialRaces, router]);

  // User location marker
  useEffect(() => {
    if (!mapReady || !map.current || !userLocation) return;

    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%;
      background: #3b82f6; border: 3px solid white;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.4);
    `;

    new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [mapReady, userLocation]);

  const racesWithCoords = initialRaces.filter((r) => r.lat && r.lng).length;

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

      {/* Legend */}
      <div className="absolute bottom-8 right-4 bg-background/90 backdrop-blur-sm border rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm">
        <div className="font-semibold text-muted-foreground mb-1">Fédérations</div>
        {[
          { color: "#3b82f6", label: "FFC" },
          { color: "#22c55e", label: "FSGT" },
          { color: "#f97316", label: "UFOLEP" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="size-3 rounded-full" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="mt-1 text-muted-foreground">
          {racesWithCoords} course{racesWithCoords !== 1 ? "s" : ""} affichée{racesWithCoords !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Race } from "@/types";
import { FRANCE_CENTER, FRANCE_ZOOM } from "@/lib/constants";
import { oklchToHex } from "@/lib/color";

interface RaceMapProps {
  races: Race[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The races currently inside the viewport, so the list can follow the map. */
  onVisibleChange: (ids: string[]) => void;
  userLocation?: { lat: number; lng: number } | null;
  /** Re-frames the map on the races the filters returned. */
  fitKey: string;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/* Read from the stylesheet rather than repeated here: the map used its own
   hard-coded hexes, so a federation was one colour in the list and another on
   the map. */

/** Used when a token is missing or cannot be parsed. */
const FALLBACK: Record<string, string> = {
  ffc: "#3b82f6",
  fsgt: "#22c55e",
  ufolep: "#f97316",
};

/**
 * Resolves a theme token to a colour MapLibre accepts.
 *
 * The palette is authored in OKLCH, which MapLibre's style parser rejects:
 * `addLayer` threw inside the load handler, so every layer after the first was
 * skipped and the map showed a basemap with no races on it at all. Converting
 * here keeps the stylesheet the single source of truth rather than adding a
 * second hard-coded palette for the map to drift from.
 */
function resolveColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^(#|rgb|hsl)/i.test(trimmed)) return trimmed;
  return oklchToHex(trimmed) ?? fallback;
}

function federationPalette(): Record<string, string> {
  if (typeof window === "undefined") return { ...FALLBACK };
  const s = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(FALLBACK).map(([slug, fallback]) => [
      slug,
      resolveColor(s.getPropertyValue(`--${slug}`), fallback),
    ])
  );
}

function racesToGeoJSON(
  races: Race[],
  palette: Record<string, string>
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: races
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng!, r.lat!] },
        properties: {
          id: r.id,
          color: palette[r.federationSlug] ?? FALLBACK.ffc,
        },
      })),
  };
}

const SOURCE = "races";
const LAYER_CLUSTER = "race-clusters";
const LAYER_CLUSTER_COUNT = "race-cluster-count";
const LAYER_POINT = "race-points";
const LAYER_SELECTED = "race-selected";

export function RaceMap({
  races,
  selectedId,
  onSelect,
  onVisibleChange,
  userLocation,
  fitKey,
}: RaceMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const userMarker = useRef<maplibregl.Marker | null>(null);

  /* Callbacks live in refs so that a new function identity from the parent
     never tears the map down. The previous version listed `userLocation` as a
     dependency of its init callback, so any change destroyed and rebuilt the
     map — and because the ready flag was already set, the rebuilt map never
     got its layers back and rendered as an empty canvas. */
  const onSelectRef = useRef(onSelect);
  const onVisibleRef = useRef(onVisibleChange);
  const racesRef = useRef(races);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onVisibleRef.current = onVisibleChange;
    racesRef.current = races;
  });

  /* Create the map exactly once. */
  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: FRANCE_CENTER,
      zoom: FRANCE_ZOOM,
      attributionControl: { compact: true },
    });
    map.current = m;

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: false }),
      "top-right"
    );
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    const palette = federationPalette();

    /* Sources and layers need the style, not a rendered frame.
       MapLibre's `load` event only fires from inside the render loop, so a map
       created while its tab or panel is hidden — where requestAnimationFrame is
       throttled to a standstill — never received it, and the races were never
       added at all. `style.load` is driven by the style request finishing, so
       it arrives either way. */
    const whenStyleReady = (fn: () => void) => {
      if (m.isStyleLoaded()) fn();
      else m.once("style.load", fn);
    };

    whenStyleReady(() => {
      m.addSource(SOURCE, {
        type: "geojson",
        data: racesToGeoJSON(racesRef.current, palette),
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 48,
        promoteId: "id",
      });

      m.addLayer({
        id: LAYER_CLUSTER,
        type: "circle",
        source: SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": palette.ffc,
          "circle-radius": [
            "interpolate", ["linear"], ["get", "point_count"],
            2, 16, 25, 24, 100, 32,
          ],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
          "circle-opacity": 0.92,
        },
      });

      m.addLayer({
        id: LAYER_CLUSTER_COUNT,
        type: "symbol",
        source: SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          // The style's own font stack: naming a font it does not ship makes
          // the whole symbol layer fail to render.
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      m.addLayer({
        id: LAYER_POINT,
        type: "circle",
        source: SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 8,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      // A halo under the selected race, so map and list agree on what is active.
      m.addLayer({
        id: LAYER_SELECTED,
        type: "circle",
        source: SOURCE,
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 16,
          "circle-opacity": 0.25,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["get", "color"],
        },
      });

      ready.current = true;
      /* Re-measure once the browser has settled the layout. MapLibre reads the
         container size when it paints, and on first load that can happen while
         the surrounding flex row is still resolving — leaving the map drawn
         into a fraction of its canvas. */
      m.resize();
      requestAnimationFrame(() => m.resize());
      publishVisible();
    });

    /* What the list should show.
       Derived from the viewport bounds, not from rendered features: at country
       zoom every point is inside a cluster, so no individual point is rendered
       and a feature-based reading would report an empty map. */
    function publishVisible() {
      if (!ready.current) return;
      const bounds = m.getBounds();
      const ids = racesRef.current
        .filter(
          (r) =>
            r.lat != null &&
            r.lng != null &&
            bounds.contains([r.lng, r.lat])
        )
        .map((r) => r.id);
      onVisibleRef.current(ids);
    }

    m.on("moveend", publishVisible);

    m.on("click", LAYER_POINT, (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) onSelectRef.current(id);
    });

    m.on("click", LAYER_CLUSTER, async (e) => {
      const feature = m.queryRenderedFeatures(e.point, {
        layers: [LAYER_CLUSTER],
      })[0];
      const clusterId = feature?.properties?.cluster_id as number | undefined;
      if (clusterId == null) return;
      try {
        const source = m.getSource(SOURCE) as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        m.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom,
          duration: 500,
        });
      } catch {
        // A cluster that vanished mid-animation is not worth reporting.
      }
    });

    // Clicking empty map closes whatever was open.
    m.on("click", (e) => {
      const hits = m.queryRenderedFeatures(e.point, {
        layers: [LAYER_POINT, LAYER_CLUSTER].filter((l) => m.getLayer(l)),
      });
      if (hits.length === 0) onSelectRef.current(null);
    });

    for (const layer of [LAYER_POINT, LAYER_CLUSTER]) {
      m.on("mouseenter", layer, () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", layer, () => {
        m.getCanvas().style.cursor = "";
      });
    }

    /* The map is created inside a flex layout that may still be settling, and
       MapLibre reads the container size once at construction. Without this it
       initialises at zero height and paints nothing — the blank map. */
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      ready.current = false;
      m.remove();
      map.current = null;
    };
  }, []);

  /* Feed new data in rather than rebuilding: setData keeps the viewport. */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const source = m.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(racesToGeoJSON(races, federationPalette()));

    const bounds = m.getBounds();
    onVisibleRef.current(
      races
        .filter((r) => r.lat != null && r.lng != null && bounds.contains([r.lng, r.lat]))
        .map((r) => r.id)
    );
  }, [races]);

  /* Frame the result set, but only when the filters actually changed — doing it
     on every data update would yank the map back while the rider is panning. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const points = races.filter((r) => r.lat != null && r.lng != null);
    if (points.length === 0) return;

    /* Frame where the racing actually is.
       The calendar legitimately includes Réunion and Guadeloupe, and fitting
       every point put the Atlantic on screen and metropolitan France in a
       thumbnail. Trimming the tails frames the bulk of the field; the overseas
       races are still on the map, a pan or a search away. */
    const fit = () => {
      const lats = points.map((r) => r.lat!).sort((a, b) => a - b);
      const lngs = points.map((r) => r.lng!).sort((a, b) => a - b);
      const at = (arr: number[], q: number) =>
        arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * q)))];

      const trim = points.length >= 20;
      const bounds = new maplibregl.LngLatBounds(
        [trim ? at(lngs, 0.03) : lngs[0], trim ? at(lats, 0.03) : lats[0]],
        [
          trim ? at(lngs, 0.97) : lngs[lngs.length - 1],
          trim ? at(lats, 0.97) : lats[lats.length - 1],
        ]
      );
      m.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 600 });
    };

    if (ready.current) fit();
    else if (m.isStyleLoaded()) fit();
    else m.once("style.load", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  /* Highlight the selection and bring it into view. */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !m.getLayer(LAYER_SELECTED)) return;

    m.setFilter(LAYER_SELECTED, ["==", ["get", "id"], selectedId ?? "__none__"]);

    if (!selectedId) return;
    const race = races.find((r) => r.id === selectedId);
    if (race?.lat != null && race.lng != null) {
      const bounds = m.getBounds();
      if (!bounds.contains([race.lng, race.lat])) {
        m.easeTo({ center: [race.lng, race.lat], duration: 500 });
      }
    }
  }, [selectedId, races]);

  /* The rider's own position, as a single reusable marker. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (!userLocation) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }

    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:var(--primary);" +
        "border:3px solid white;box-shadow:0 0 0 4px color-mix(in oklch, var(--primary) 30%, transparent);";
      userMarker.current = new maplibregl.Marker({ element: el });
    }
    /* Position before attaching: adding a marker that has no coordinates yet
       throws inside MapLibre, which is what broke the whole page the moment a
       town was picked from the search. */
    userMarker.current.setLngLat([userLocation.lng, userLocation.lat]).addTo(m);
  }, [userLocation]);

  /* Sized directly rather than by `absolute inset-0`: maplibre-gl.css sets
     `position: relative` on `.maplibregl-map`, and because it is bundled after
     the utility layer it wins on source order — the container fell back to
     auto height, measured zero, and the map painted nothing. */
  return <div ref={container} className="h-full w-full" />;
}

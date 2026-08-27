"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { oklchToHex } from "@/lib/color";

/**
 * The course drawn on the ground.
 *
 * Paired with the profile beside it: moving along one moves the marker on the
 * other, which is the whole point — a gradient means nothing until you know
 * which corner of the circuit it is on.
 */

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function resolve(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  try {
    const ctx = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    if (ctx) {
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a > 0) {
        const hex = (n: number) => n.toString(16).padStart(2, "0");
        return `#${hex(r)}${hex(g)}${hex(b)}`;
      }
    }
  } catch {
    // fall through
  }
  return oklchToHex(value) ?? fallback;
}

interface Props {
  points: Array<[number, number, number, number]>;
  bounds: { west: number; south: number; east: number; north: number };
  /** The point the profile is hovering, so the map can mark it. */
  cursor: number | null;
}

export function CircuitMap({ points, bounds, cursor }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      bounds: [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      fitBoundsOptions: { padding: 32 },
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const line = resolve("--primary", "#22406e");
    const start = resolve("--accent", "#b8801a");

    // Sources and layers hang off style.load, not load: a map created while
    // its panel is hidden never gets the latter.
    const whenReady = (fn: () => void) => {
      if (m.isStyleLoaded()) fn();
      else m.once("style.load", fn);
    };

    whenReady(() => {
      m.addSource("course", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: points.map((p) => [p[0], p[1]]),
          },
        },
      });

      // Drawn twice: a pale casing under a solid line, so the course stays
      // legible over both fields and towns.
      m.addLayer({
        id: "course-casing",
        type: "line",
        source: "course",
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.85,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      m.addLayer({
        id: "course-line",
        type: "line",
        source: "course",
        paint: { "line-color": line, "line-width": 3.5 },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      const first = points[0];
      if (first) {
        const el = document.createElement("div");
        el.style.cssText =
          `width:12px;height:12px;border-radius:50%;background:${start};` +
          `border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)`;
        new maplibregl.Marker({ element: el })
          .setLngLat([first[0], first[1]])
          .addTo(m);
      }

      ready.current = true;
      m.resize();
    });

    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Follow the profile's cursor. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (cursor === null || !points[cursor]) {
      marker.current?.remove();
      marker.current = null;
      return;
    }

    const [lng, lat] = points[cursor];
    if (!marker.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#fff;" +
        "border:3px solid currentColor;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      el.style.color = resolve("--accent", "#b8801a");
      marker.current = new maplibregl.Marker({ element: el });
    }
    marker.current.setLngLat([lng, lat]).addTo(m);
  }, [cursor, points]);

  return <div ref={container} className="h-full w-full" />;
}

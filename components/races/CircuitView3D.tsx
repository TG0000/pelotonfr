"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Layers, Satellite } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { bearings } from "@/lib/circuit-mesh";
import { cn } from "@/lib/utils";

/**
 * The circuit, on the ground it is raced on.
 *
 * A flat map says where the race is. What it cannot say is what the race *is* —
 * and on a village circuit that lives in the relief: the drag out of the valley
 * that comes round eleven times, the exposed plateau where a crosswind cuts the
 * bunch into echelons.
 *
 * Drawn by MapLibre, which does terrain itself from a raster elevation source
 * with imagery draped over it. An earlier version built the scene by hand — a
 * grid of heights, a road ribbon, a camera — and then again on three.js. Both
 * drew the right shape onto a bare mesh, and a bare mesh is a diagram: a rider
 * recognises a circuit by its hedges, its lanes, the roundabout at the top of
 * the hill. None of that survives being modelled; all of it is already in an
 * aerial photograph.
 *
 * The imagery is the IGN's, at twenty centimetres over France under the Licence
 * Ouverte — the same service the profile's heights come from. The relief is the
 * public Terrarium tiles, which cover everywhere the IGN does not.
 *
 * And this replaces three.js rather than adding to it: the calendar's map is
 * MapLibre already, so the circuit view now costs nothing that was not being
 * shipped.
 */

const DEM =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const IGN_ORTHO =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile" +
  "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM" +
  "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg";

const PLAN = "https://tiles.openfreemap.org/styles/liberty";

/** Climbs by severity; everything downhill is one quiet colour. */
function gradientHex(pct: number): string {
  if (pct < -1) return "#9aa4b2";
  if (pct < 3) return "#5cb87f";
  if (pct < 6) return "#e5b84c";
  if (pct < 9) return "#e0853d";
  return "#d95347";
}

export function CircuitView3D({
  points,
  cursor,
  windFromDeg,
  windKmh,
  className,
}: {
  points: Array<[number, number, number, number]>;
  /** Which point the profile is being read at, so the course can show where. */
  cursor?: number | null;
  windFromDeg: number | null;
  windKmh: number | null;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [satellite, setSatellite] = useState(true);

  /**
   * The colour ramp along the lap, as stops on the line's own progress.
   *
   * Sampled down to about a hundred and twenty: MapLibre interpolates between
   * stops, and a stop every fifty metres draws a smoother ramp than the eye
   * can resolve at this zoom while keeping the expression small enough to
   * re-evaluate on every frame of a pitch change.
   */
  const rampStops = useMemo(() => {
    const total = points[points.length - 1]?.[3] || 1;
    const wanted = Math.min(120, Math.max(24, Math.round(points.length / 3)));
    const step = Math.max(1, Math.floor(points.length / wanted));
    const stops: Array<number | string> = [];
    let last = -1;

    for (let i = 0; i < points.length; i += step) {
      const a = points[Math.max(0, i - 3)];
      const b = points[Math.min(points.length - 1, i + 3)];
      const run = b[3] - a[3];
      const pct = run > 1 ? ((b[2] - a[2]) / run) * 100 : 0;
      // Stops must strictly increase or the expression is rejected outright.
      const at = Math.min(0.999, Math.max(0, points[i][3] / total));
      if (at <= last) continue;
      last = at;
      stops.push(at, gradientHex(pct));
    }
    if (stops.length < 4) return [0, "#5cb87f", 1, "#5cb87f"];
    return stops;
  }, [points]);

  useEffect(() => {
    const el = host.current;
    if (!el || map.current) return;

    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points.map(([lng, lat]) => [lng, lat]),
      },
    };

    const m = new maplibregl.Map({
      container: el,
      style: PLAN,
      // 60° is the angle a course is looked at from a car window; flat on is a
      // map and straight down is a satellite photograph.
      pitch: 62,
      bearing: -22,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    map.current = m;

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const bounds = new maplibregl.LngLatBounds();
    for (const [lng, lat] of points) bounds.extend([lng, lat]);

    m.on("style.load", () => {
      if (!m.getSource("relief")) {
        m.addSource("relief", {
          type: "raster-dem",
          tiles: [DEM],
          tileSize: 256,
          maxzoom: 14,
          encoding: "terrarium",
          attribution: "Relief : Terrarium / Mapzen",
        });
      }
      m.setTerrain({ source: "relief", exaggeration: 1.4 });

      if (satellite && !m.getSource("ortho")) {
        m.addSource("ortho", {
          type: "raster",
          tiles: [IGN_ORTHO],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Orthophotos IGN — Licence Ouverte",
        });
      }
      if (satellite && !m.getLayer("ortho")) {
        // Under the labels the base style draws, so place names survive.
        const firstSymbol = m
          .getStyle()
          .layers?.find((l) => l.type === "symbol")?.id;
        m.addLayer(
          { id: "ortho", type: "raster", source: "ortho", paint: { "raster-opacity": 1 } },
          firstSymbol
        );
      }

      if (!m.getSource("circuit")) {
        m.addSource("circuit", { type: "geojson", data: line, lineMetrics: true });
      }
      if (!m.getLayer("circuit-casing")) {
        m.addLayer({
          id: "circuit-casing",
          type: "line",
          source: "circuit",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0d1117",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 14],
            "line-opacity": 0.55,
          },
        });
      }
      if (!m.getLayer("circuit")) {
        m.addLayer({
          id: "circuit",
          type: "line",
          source: "circuit",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 9],
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              ...rampStops,
            ],
          },
        });
      }

      m.addLayer({
        id: "ciel",
        type: "sky",
        paint: {
          "sky-color": "#8bb4e8",
          "sky-horizon-blend": 0.6,
          "horizon-color": "#d8e4f0",
          "horizon-fog-blend": 0.6,
          "fog-color": "#cfd9e4",
          "fog-ground-blend": 0.7,
        },
      } as unknown as maplibregl.LayerSpecification);

      /* Where the profile is being read.
         Hovering a profile and watching the place move on the course is what
         turns two pictures into one reading — without it a rider has to hold
         "the hard bit at four kilometres" in their head while they look for it. */
      if (!m.getSource("curseur")) {
        m.addSource("curseur", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("curseur")) {
        m.addLayer({
          id: "curseur",
          type: "circle",
          source: "curseur",
          paint: {
            "circle-radius": 7,
            "circle-color": "#ffffff",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#0d1117",
          },
        });
      }

      m.fitBounds(bounds, { padding: 56, pitch: 62, bearing: -22, duration: 0 });
    });

    return () => {
      m.remove();
      map.current = null;
    };
    // Built once; the satellite toggle is handled on its own below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, rampStops]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    if (satellite) {
      if (!m.getSource("ortho")) {
        m.addSource("ortho", {
          type: "raster",
          tiles: [IGN_ORTHO],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Orthophotos IGN — Licence Ouverte",
        });
      }
      if (!m.getLayer("ortho")) {
        const firstSymbol = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        m.addLayer(
          { id: "ortho", type: "raster", source: "ortho", paint: { "raster-opacity": 1 } },
          firstSymbol
        );
      }
    } else if (m.getLayer("ortho")) {
      m.removeLayer("ortho");
    }
  }, [satellite]);

  useEffect(() => {
    const m = map.current;
    const source = m?.getSource("curseur") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const at = cursor != null ? points[cursor] : null;
    source.setData(
      at
        ? {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [at[0], at[1]] },
          }
        : { type: "FeatureCollection", features: [] }
    );
  }, [cursor, points]);

  /** Where the wind bites, said in words rather than painted over the road. */
  const windReading = useMemo(() => {
    if (windFromDeg == null) return null;
    const bear = bearings(points);
    const towards = ((windFromDeg + 180) * Math.PI) / 180;
    let intoM = 0;
    for (let i = 1; i < points.length; i++) {
      const alignment = -Math.cos(towards - (bear[i] * Math.PI) / 180);
      if (alignment > 0.4) intoM += points[i][3] - points[i - 1][3];
    }
    const total = points[points.length - 1][3] || 1;
    return Math.round((intoM / total) * 100);
  }, [points, windFromDeg]);

  return (
    <div className={cn("relative", className)}>
      <div ref={host} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <button
          type="button"
          onClick={() => setSatellite((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-surface-2"
        >
          {satellite ? <Layers className="size-3.5" /> : <Satellite className="size-3.5" />}
          {satellite ? "Plan" : "Vue aérienne"}
        </button>

        <div className="pointer-events-none rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs backdrop-blur">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Legend colour="#9aa4b2" label="descente" />
            <Legend colour="#5cb87f" label="< 3 %" />
            <Legend colour="#e5b84c" label="3–6 %" />
            <Legend colour="#e0853d" label="6–9 %" />
            <Legend colour="#d95347" label="> 9 %" />
            {windReading != null && (
              <span className="text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">
                  {windReading} %
                </span>{" "}
                face au vent
                {windKmh != null && (
                  <span className="font-mono tabular-nums"> · {Math.round(windKmh)} km/h</span>
                )}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span aria-hidden className="size-2 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}

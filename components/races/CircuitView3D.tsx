"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Layers, Satellite, Wind } from "lucide-react";
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
  const [showWind, setShowWind] = useState(false);

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

  /**
   * The wind, as arrows standing on the course.
   *
   * Colouring the road by exposure meant losing the gradient to say it, and the
   * gradient is what a rider looks for first. Words alone — "38 % du tour face
   * au vent" — are true and say nothing about *where*.
   *
   * Arrows say both at once. They all point the same way, because the wind
   * does, so the direction reads without a legend; and each is coloured by what
   * it does to a rider at that point of the lap. Every three hundred metres,
   * which is about as often as a village circuit changes its mind.
   */
  const windArrows = useMemo<GeoJSON.FeatureCollection>(() => {
    if (windFromDeg == null) {
      return { type: "FeatureCollection", features: [] };
    }
    const towards = (windFromDeg + 180) % 360;
    const bear = bearings(points);
    const features: GeoJSON.Feature[] = [];
    let nextAt = 0;

    for (let i = 0; i < points.length; i++) {
      if (points[i][3] < nextAt) continue;
      nextAt = points[i][3] + 300;

      const alignment = -Math.cos(
        ((towards - bear[i]) * Math.PI) / 180
      );
      features.push({
        type: "Feature",
        properties: {
          rotation: towards,
          effect:
            alignment > 0.4 ? "face" : alignment < -0.4 ? "dos" : "travers",
        },
        geometry: { type: "Point", coordinates: [points[i][0], points[i][1]] },
      });
    }
    return { type: "FeatureCollection", features };
  }, [points, windFromDeg]);

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
      /* Off by default because keeping the drawing buffer costs memory and a
         little speed on every frame. On with ?capture=1, which is how the
         rendered scene can be read back as an image and checked — a map that
         can only be judged by looking at it can only be judged by whoever is
         sitting in front of it. */
      canvasContextAttributes: {
        antialias: true,
        preserveDrawingBuffer:
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).has("capture"),
      },
    });
    map.current = m;

    /* In capture mode the map is reachable from the console, so a layer that
       refuses to draw can be interrogated instead of guessed at. */
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("capture")
    ) {
      (window as unknown as { __carte?: maplibregl.Map }).__carte = m;
    }

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const bounds = new maplibregl.LngLatBounds();
    for (const [lng, lat] of points) bounds.extend([lng, lat]);

    m.on("style.load", () => {
      try {
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

      /* MapLibre 5 sets the sky on the map, not as a layer — asking for a
         "sky" layer throws during style validation, and a throw in here takes
         the terrain, the course and the camera down with it. */
      m.setSky({
        "sky-color": "#8bb4e8",
        "sky-horizon-blend": 0.6,
        "horizon-color": "#d8e4f0",
        "horizon-fog-blend": 0.6,
        "fog-color": "#cfd9e4",
        "fog-ground-blend": 0.7,
      });

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

      /* Three arrows, one per verdict, rather than one arrow tinted.
         MapLibre will recolour an icon, but only if it is registered as a
         signed distance field — and a hard-edged triangle makes a degenerate
         one, which is why the first attempt drew nothing at all. Three small
         images cost nothing and always render. */
      const ARROWS: Array<[string, string]> = [
        ["vent-face", "#e04a3c"],
        ["vent-travers", "#e8b73f"],
        ["vent-dos", "#4fb87a"],
      ];
      for (const [name, colour] of ARROWS) {
        if (m.hasImage(name)) continue;
        const size = 56;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const g = c.getContext("2d")!;
        g.beginPath();
        g.moveTo(28, 6);
        g.lineTo(45, 40);
        g.lineTo(28, 31);
        g.lineTo(11, 40);
        g.closePath();
        g.fillStyle = colour;
        g.fill();
        // A dark rim so a red arrow still reads over a ploughed field.
        g.strokeStyle = "rgba(10,14,20,0.85)";
        g.lineWidth = 3;
        g.stroke();
        m.addImage(name, g.getImageData(0, 0, size, size));
      }

      if (!m.getSource("vent")) {
        m.addSource("vent", { type: "geojson", data: windArrows });
      }
      if (!m.getLayer("vent")) {
        m.addLayer({
          id: "vent",
          type: "symbol",
          source: "vent",
          layout: {
            "icon-image": [
              "match",
              ["get", "effect"],
              "face", "vent-face",
              "dos", "vent-dos",
              "vent-travers",
            ],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.75],
            "icon-rotate": ["get", "rotation"],
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            visibility: "none",
          },
        });
      }

      m.fitBounds(bounds, { padding: 56, pitch: 62, bearing: -22, duration: 0 });
      } catch (err) {
        // The course still draws without the sky, or without the relief.
        console.error("circuit:", err);
      }
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
    if (!m || !m.getLayer("vent")) return;
    m.setLayoutProperty("vent", "visibility", showWind ? "visible" : "none");
  }, [showWind]);

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
        <div className="pointer-events-auto flex gap-2">
        <button
          type="button"
          onClick={() => setSatellite((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-surface-2"
        >
          {satellite ? <Layers className="size-3.5" /> : <Satellite className="size-3.5" />}
          {satellite ? "Plan" : "Vue aérienne"}
        </button>

        <button
          type="button"
          disabled={windFromDeg == null}
          onClick={() => setShowWind((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors",
            showWind ? "bg-surface-3" : "bg-surface-1/90 hover:bg-surface-2",
            windFromDeg == null && "cursor-not-allowed opacity-40"
          )}
          title={
            windFromDeg == null
              ? "Prévision indisponible à cette échéance"
              : undefined
          }
        >
          <Wind className="size-3.5" />
          Vent
        </button>
        </div>

        <div className="pointer-events-none rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs backdrop-blur">
          {showWind ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Legend colour="#d95347" label="de face" />
              <Legend colour="#e5b84c" label="de travers" />
              <Legend colour="#5cb87f" label="dans le dos" />
              {windReading != null && (
                <span className="text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {windReading} %
                  </span>{" "}
                  du tour de face
                  {windKmh != null && (
                    <span className="font-mono tabular-nums">
                      {" "}· {Math.round(windKmh)} km/h
                    </span>
                  )}
                </span>
              )}
            </span>
          ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Legend colour="#9aa4b2" label="descente" />
            <Legend colour="#5cb87f" label="< 3 %" />
            <Legend colour="#e5b84c" label="3–6 %" />
            <Legend colour="#e0853d" label="6–9 %" />
            <Legend colour="#d95347" label="> 9 %" />
          </span>
          )}
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

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The course, seen from the side.
 *
 * Gradient is what a rider reads a profile for, so the line is coloured by it
 * rather than left a single hue: the eye finds the steep sections before it
 * reads any number. The bands are a road cyclist's, not a cartographer's —
 * under 3% you sit down, past 8% the bunch comes apart.
 */

export interface ProfilePoint {
  distanceM: number;
  altitudeM: number;
}

/**
 * What a gradient costs, which is not the same as how steep it is.
 *
 * The bands used to be read from the absolute value, so a descent at eight per
 * cent was painted the same red as the climb it came off — the profile marked
 * the easiest fifty seconds of the lap as its hardest. A rider reads a profile
 * to find where the race is decided, and a descent decides nothing by being
 * steep.
 *
 * So the sign carries: climbs are graded by severity, and everything downhill
 * is one quiet colour. It is not that a descent is uninteresting, it is that
 * its difficulty is technical and a colour ramp cannot say that.
 */
const CLIMB_BANDS = [
  { max: 3, color: "var(--color-fsgt)" },
  { max: 6, color: "var(--color-accent)" },
  { max: 9, color: "var(--color-ufolep)" },
  { max: Infinity, color: "var(--color-destructive)" },
];

/** Downhill, and flat enough not to be a climb. */
const DESCENT = "var(--color-chart-5)";

function bandFor(gradient: number): string {
  if (gradient < -1) return DESCENT;
  return (CLIMB_BANDS.find((b) => gradient < b.max) ?? CLIMB_BANDS[0]).color;
}

interface Props {
  points: Array<[number, number, number, number]>;
  minElevationM: number;
  maxElevationM: number;
  /** Told which point the cursor is over, so a map can follow. */
  onHover?: (index: number | null) => void;
  /** Where the wind comes from on the day, when the forecast reaches. */
  windFromDeg?: number | null;
  className?: string;
  /** Les photos et dangers lus sur la boucle, posés au kilomètre. */
  marks?: Array<{ alongM: number; kind: "photo" | "danger"; severity?: number }>;
  /** Là où Street View a un panorama, en portions du tour. */
  coverage?: Array<{ fromM: number; toM: number }>;
  /** Un clic choisit un point : le panorama s'y place. */
  onSelect?: (index: number) => void;
}

const W = 1000;
const H = 250;
/** The strip along the foot of the profile that carries the wind. */
const WIND_H = 9;
const PAD_BOTTOM = 22;
const PAD_TOP = 22;
const PAD_LEFT = 34;

export function ElevationProfile({
  points,
  minElevationM,
  maxElevationM,
  onHover,
  windFromDeg,
  className,
  marks = [],
  coverage = [],
  onSelect,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const totalM = points.length ? points[points.length - 1][3] : 0;
  // A flat course still needs vertical room, or the line becomes a wire.
  const span = Math.max(maxElevationM - minElevationM, 40);

  const x = useCallback(
    (d: number) => (totalM > 0 ? PAD_LEFT + (d / totalM) * (W - PAD_LEFT) : PAD_LEFT),
    [totalM]
  );
  const y = useCallback(
    (a: number) =>
      H - PAD_BOTTOM - ((a - minElevationM) / span) * (H - PAD_BOTTOM - PAD_TOP),
    [minElevationM, span]
  );

  /**
   * One path per gradient band, so the colour changes along the line.
   *
   * The gradient is read over a hundred metres rather than between two adjacent
   * points. At a point every twenty metres, a point-to-point reading is mostly
   * measurement noise: a road at a steady one per cent came out as a stutter of
   * flat and five per cent, and the colour flickered green-orange-green down a
   * straight where nothing was happening. A hundred metres is also about the
   * shortest stretch a rider would describe as having a gradient at all.
   */
  const gradients = useMemo(() => {
    const BASELINE_M = 100;
    const out = new Array<number>(points.length).fill(0);
    let low = 0;
    let high = 0;

    for (let i = 0; i < points.length; i++) {
      const here = points[i][3];
      while (low < i && here - points[low][3] > BASELINE_M / 2) low++;
      while (high < points.length - 1 && points[high][3] - here < BASELINE_M / 2) high++;
      const run = points[high][3] - points[low][3];
      out[i] = run > 1 ? ((points[high][2] - points[low][2]) / run) * 100 : 0;
    }
    return out;
  }, [points]);

  const segments = useMemo(() => {
    const out: Array<{ d: string; color: string }> = [];
    let current: { d: string; color: string } | null = null;

    for (let i = 1; i < points.length; i++) {
      const [, , a0, d0] = points[i - 1];
      const [, , a1, d1] = points[i];
      const color = bandFor(gradients[i]);

      if (!current || current.color !== color) {
        if (current) out.push(current);
        current = { color, d: `M ${x(d0).toFixed(1)} ${y(a0).toFixed(1)}` };
      }
      current.d += ` L ${x(d1).toFixed(1)} ${y(a1).toFixed(1)}`;
    }
    if (current) out.push(current);
    return out;
  }, [points, gradients, x, y]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return "";
    const line = points
      .map((p) => `${x(p[3]).toFixed(1)} ${y(p[2]).toFixed(1)}`)
      .join(" L ");
    return `M ${PAD_LEFT} ${H - PAD_BOTTOM} L ${line} L ${W} ${H - PAD_BOTTOM} Z`;
  }, [points, x, y]);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const left = rect.left + (PAD_LEFT / W) * rect.width;
    const ratio = Math.max(0, Math.min(1, (event.clientX - left) / (rect.width * (1 - PAD_LEFT / W))));
    const target = ratio * totalM;

    // The points are ordered by distance, so a scan is enough at this size.
    let index = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i][3] - target) < Math.abs(points[index][3] - target)) {
        index = i;
      }
    }
    setCursor(index);
    onHover?.(index);
  }

  function handleLeave() {
    setCursor(null);
    onHover?.(null);
  }

  /**
   * The wind, as a strip under the profile rather than a repaint of the line.
   *
   * Colouring the profile itself by wind meant losing the gradient to say it,
   * and the gradient is what a rider looks for first. Two informations, two
   * bands: the climb above, and along the foot of it, which way the wind will
   * be meeting them at that point of the lap.
   */
  const windBands = useMemo(() => {
    if (windFromDeg == null || points.length < 3) return [];
    const towards = ((windFromDeg + 180) * Math.PI) / 180;

    const out: Array<{ from: number; to: number; fill: string }> = [];
    let current: { from: number; to: number; fill: string } | null = null;

    for (let i = 1; i < points.length; i++) {
      const a = points[Math.max(0, i - 2)];
      const b = points[Math.min(points.length - 1, i + 2)];
      const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
      const travel = Math.atan2(dLng, b[1] - a[1]);
      const alignment = -Math.cos(towards - travel);

      const fill =
        alignment > 0.4
          ? "var(--color-destructive)"
          : alignment < -0.4
            ? "var(--color-fsgt)"
            : "var(--color-accent)";

      if (current && current.fill === fill) current.to = points[i][3];
      else {
        if (current) out.push(current);
        current = { from: points[i - 1][3], to: points[i][3], fill };
      }
    }
    if (current) out.push(current);
    return out;
  }, [points, windFromDeg]);

  const active = cursor !== null ? points[cursor] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={() => { if (cursor !== null) onSelect?.(cursor); }}
        role="img"
        aria-label={`Profil du parcours, ${Math.round(totalM / 1000)} kilomètres`}
      >
        <path d={areaPath} fill="var(--color-primary)" opacity="0.08" />

        {/* Street View : une ligne fine au-dessus du vent, pleine là où un
            panorama existe, pointillée là où l'on est aveugle. */}
        {coverage.length > 0 && (
          <g>
            <line x1={x(0)} y1={H - PAD_BOTTOM - WIND_H - 4} x2={x(totalM)} y2={H - PAD_BOTTOM - WIND_H - 4} stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="2 3" />
            {coverage.map((c, i) => (
              <line key={i} x1={x(c.fromM)} y1={H - PAD_BOTTOM - WIND_H - 4} x2={x(Math.min(c.toM, totalM))} y2={H - PAD_BOTTOM - WIND_H - 4} stroke="var(--color-primary)" strokeWidth="2.5" />
            ))}
          </g>
        )}

        {/* Les photos lues (points) et les dangers (triangles), au-dessus du profil. */}
        {marks.map((m, i) => {
          const select = (e: React.MouseEvent) => {
            e.stopPropagation();
            let idx = points.findIndex((p) => p[3] >= m.alongM);
            if (idx < 0) idx = points.length - 1;
            onSelect?.(idx);
          };
          return m.kind === "danger" ? (
            <polygon
              key={`m${i}`}
              onClick={select}
              style={{ cursor: "pointer" }}
              points={`${x(m.alongM)},${PAD_TOP - 12} ${x(m.alongM) - 5},${PAD_TOP - 3} ${x(m.alongM) + 5},${PAD_TOP - 3}`}
              fill={(m.severity ?? 1) >= 2 ? "var(--color-destructive)" : "var(--color-accent)"}
            />
          ) : (
            <circle key={`m${i}`} onClick={select} style={{ cursor: "pointer" }} cx={x(m.alongM)} cy={PAD_TOP - 7} r="3.5" fill="var(--color-accent)" stroke="var(--color-background)" strokeWidth="1" />
          );
        })}

        {/* The wind along the foot: face, travers, dos. */}
        {windBands.map((b, i) => (
          <rect
            key={i}
            x={x(b.from)}
            y={H - PAD_BOTTOM - WIND_H}
            width={Math.max(0.5, x(b.to) - x(b.from))}
            height={WIND_H}
            fill={b.fill}
            opacity="0.72"
          />
        ))}
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Des repères à l'échelle de la boucle : tous les kilomètres sur un
            tour de village, tous les cinq sur une course en ligne, tous les
            dix au-delà. Sans ça, un tour de 5 km n'avait aucun repère. */}
        {(() => {
          const stepKm = totalM < 15_000 ? 1 : totalM < 60_000 ? 5 : 10;
          return Array.from({ length: Math.floor(totalM / (stepKm * 1000)) }, (_, i) => {
            const km = (i + 1) * stepKm;
            return (
              <g key={km}>
                <line x1={x(km * 1000)} y1={PAD_TOP} x2={x(km * 1000)} y2={H - PAD_BOTTOM} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="2 4" />
                <text x={x(km * 1000)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {km}
                </text>
              </g>
            );
          });
        })()}

        {/* L'altitude, en marge : deux ou trois lignes à des valeurs rondes,
            pour lire une bosse en mètres et pas seulement en forme. */}
        {(() => {
          const step = span <= 60 ? 20 : span <= 150 ? 50 : span <= 400 ? 100 : 250;
          const first = Math.ceil(minElevationM / step) * step;
          const lines: number[] = [];
          for (let a = first; a <= minElevationM + span; a += step) lines.push(a);
          return lines.map((a) => (
            <g key={`alt${a}`}>
              <line x1={PAD_LEFT} y1={y(a)} x2={W} y2={y(a)} stroke="var(--color-border)" strokeWidth="1" opacity="0.7" />
              <text x={PAD_LEFT - 5} y={y(a) + 4} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                {a}
              </text>
            </g>
          ));
        })()}

        {active && (
          <line
            x1={x(active[3])} y1={PAD_TOP}
            x2={x(active[3])} y2={H - PAD_BOTTOM}
            stroke="var(--color-foreground)" strokeWidth="1.5"
          />
        )}
        {active && (
          <circle
            cx={x(active[3])} cy={y(active[2])} r="5"
            fill="var(--color-accent)"
            stroke="var(--color-background)" strokeWidth="2"
          />
        )}
      </svg>

      {active && (
        <div className="pointer-events-none absolute left-0 top-0 rounded-md border border-border bg-surface-1/95 px-2 py-1 font-mono text-xs tabular-nums shadow-sm backdrop-blur">
          {(active[3] / 1000).toFixed(1)} km · {Math.round(active[2])} m
        </div>
      )}
    </div>
  );
}

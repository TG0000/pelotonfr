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

const GRADIENT_BANDS = [
  { max: 3, color: "var(--color-fsgt)" },
  { max: 6, color: "var(--color-accent)" },
  { max: 9, color: "var(--color-ufolep)" },
  { max: Infinity, color: "var(--color-destructive)" },
];

function bandFor(gradient: number): string {
  const g = Math.abs(gradient);
  return (GRADIENT_BANDS.find((b) => g < b.max) ?? GRADIENT_BANDS[0]).color;
}

interface Props {
  points: Array<[number, number, number, number]>;
  minElevationM: number;
  maxElevationM: number;
  /** Told which point the cursor is over, so a map can follow. */
  onHover?: (index: number | null) => void;
  className?: string;
}

const W = 1000;
const H = 220;
const PAD_BOTTOM = 22;
const PAD_TOP = 12;

export function ElevationProfile({
  points,
  minElevationM,
  maxElevationM,
  onHover,
  className,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const totalM = points.length ? points[points.length - 1][3] : 0;
  // A flat course still needs vertical room, or the line becomes a wire.
  const span = Math.max(maxElevationM - minElevationM, 40);

  const x = useCallback(
    (d: number) => (totalM > 0 ? (d / totalM) * W : 0),
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
    return `M 0 ${H - PAD_BOTTOM} L ${line} L ${W} ${H - PAD_BOTTOM} Z`;
  }, [points, x, y]);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
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

  const active = cursor !== null ? points[cursor] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        role="img"
        aria-label={`Profil du parcours, ${Math.round(totalM / 1000)} kilomètres`}
      >
        <path d={areaPath} fill="var(--color-primary)" opacity="0.08" />
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

        {/* Every 10 km, so the eye can place itself along the course. */}
        {Array.from({ length: Math.floor(totalM / 10_000) }, (_, i) => {
          const km = (i + 1) * 10;
          return (
            <g key={km}>
              <line
                x1={x(km * 1000)} y1={PAD_TOP}
                x2={x(km * 1000)} y2={H - PAD_BOTTOM}
                stroke="var(--color-border)" strokeWidth="1"
              />
              <text
                x={x(km * 1000)} y={H - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              >
                {km}
              </text>
            </g>
          );
        })}

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

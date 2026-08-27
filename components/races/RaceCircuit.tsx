"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Route } from "lucide-react";
import { ElevationProfile } from "./ElevationProfile";
import type { RaceTrace } from "@/lib/db/queries/race-detail";

const CircuitMap = dynamic(
  () => import("./CircuitMap").then((m) => ({ default: m.CircuitMap })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-surface-2">
        <span className="text-sm text-muted-foreground">Chargement du tracé…</span>
      </div>
    ),
  }
);

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatEditionDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xl font-medium tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * The circuit, on the ground and in profile, moving together.
 *
 * A gradient means nothing until you know which corner it is on, so hovering
 * the profile marks the map. The two halves share one cursor for that reason
 * and no other.
 */
export function RaceCircuit({ trace }: { trace: RaceTrace }) {
  const [cursor, setCursor] = useState<number | null>(null);

  const km = trace.distanceM / 1000;
  // Metres of climbing per kilometre — the number that says whether a course is
  // hard independently of how long it is.
  const density = km > 0 ? trace.elevationGainM / km : 0;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Route className="size-4 text-muted-foreground" />
        Le parcours
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          relevé par un coureur
        </span>
      </h2>

      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        <div className="h-72 w-full sm:h-80">
          <CircuitMap points={trace.points} bounds={trace.bounds} cursor={cursor} />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border px-4 py-3 sm:grid-cols-4">
          <Figure label="Distance" value={km.toFixed(1)} unit="km" />
          <Figure label="Dénivelé" value={String(trace.elevationGainM)} unit="m" />
          <Figure label="Par km" value={density.toFixed(1)} unit="m" />
          <Figure
            label="Altitude"
            value={`${trace.minElevationM}–${trace.maxElevationM}`}
            unit="m"
          />
        </div>

        <div className="border-t border-border px-2 pb-1 pt-2">
          <ElevationProfile
            points={trace.points}
            minElevationM={trace.minElevationM}
            maxElevationM={trace.maxElevationM}
            onHover={setCursor}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {trace.source === "segment"
          ? "Circuit reconnu parmi les segments Strava du secteur, altitudes lues sur le relief public."
          : "Tracé relevé par un coureur ayant disputé l'épreuve."}
        {!trace.sameDay && trace.tracedOn && (
          <> Relevé sur l&apos;édition du {formatEditionDate(trace.tracedOn)}.</>
        )}{" "}
        Il peut différer du parcours officiel si l&apos;organisateur l&apos;a
        modifié.
      </p>
    </section>
  );
}

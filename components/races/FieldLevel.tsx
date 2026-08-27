import { Gauge } from "lucide-react";
import { getFieldLevel } from "@/lib/db/queries/race-detail";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * How hard this race has actually been.
 *
 * A start list says who is coming; this says what turning up has meant. The
 * measure is the median national ranking of the riders who finished it, not the
 * average — one former professional in a field of clubmen drags an average
 * across two categories and tells a rider nothing.
 *
 * The bands come from the calendar itself rather than from intuition: across
 * 2 223 races with ten or more ranked finishers, the median field rank runs
 * from about 400 at the tenth percentile to 3 700 at the ninetieth.
 */

const BANDS = [
  { max: 700, label: "Plateau très relevé", tone: "text-destructive", steps: 5 },
  { max: 1500, label: "Plateau relevé", tone: "text-accent", steps: 4 },
  { max: 2500, label: "Niveau habituel", tone: "text-foreground", steps: 3 },
  { max: 3300, label: "Plateau abordable", tone: "text-muted-foreground", steps: 2 },
  { max: Infinity, label: "Plateau ouvert", tone: "text-muted-foreground", steps: 1 },
];

function bandFor(medianRank: number) {
  return BANDS.find((b) => medianRank < b.max) ?? BANDS[BANDS.length - 1];
}

function Figure({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-mono text-xl font-medium tabular-nums", tone)}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal">{unit}</span>}
      </div>
    </div>
  );
}

export async function FieldLevel({ raceId }: { raceId: string }) {
  let level: Awaited<ReturnType<typeof getFieldLevel>> = null;
  try {
    level = await getFieldLevel(raceId);
  } catch {
    return null;
  }

  // Nothing has been raced here yet — the honest answer is silence.
  if (!level || level.medianClassified === 0) return null;

  const band = level.medianRank !== null ? bandFor(level.medianRank) : null;

  return (
    <section>
      <SectionHeading icon={Gauge}>
        Le niveau de l&apos;épreuve
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {level.editions} édition{level.editions > 1 ? "s" : ""} au fichier
        </span>
      </SectionHeading>

      <div className="rounded-xl border border-border bg-surface-1 p-4">
        {band && (
          <div className="mb-4 flex items-center gap-3">
            <div className="flex items-end gap-1" aria-hidden>
              {[1, 2, 3, 4, 5].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "w-2 rounded-sm",
                    step <= band.steps ? "bg-current" : "bg-surface-3",
                    step <= band.steps && band.tone
                  )}
                  style={{ height: `${8 + step * 5}px` }}
                />
              ))}
            </div>
            <span className={cn("font-semibold", band.tone)}>{band.label}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Partants classés" value={String(level.medianClassified)} />
          {level.medianRank !== null && (
            <Figure
              label="Rang médian"
              value={`#${level.medianRank}`}
              tone={band?.tone}
            />
          )}
          {level.bestRank !== null && (
            <Figure label="Meilleur venu" value={`#${level.bestRank}`} />
          )}
          {level.averageSpeedKmh !== null && (
            <Figure
              label="Vitesse relevée"
              value={String(level.averageSpeedKmh)}
              unit="km/h"
            />
          )}
        </div>

        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Établi sur les coureurs classés aux éditions précédentes.
          {level.rankedShare < 0.7 && (
            <>
              {" "}
              {Math.round(level.rankedShare * 100)} % d&apos;entre eux portent un
              classement national — le reste ne pèse pas dans cette lecture.
            </>
          )}
          {level.averageSpeedKmh !== null && (
            <> Vitesse relevée sur une sortie enregistrée le jour de la course.</>
          )}
        </p>
      </div>
    </section>
  );
}

import { TrendingUp } from "lucide-react";
import { getRaceClimbs } from "@/lib/db/queries/race-detail";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * The climbs a rider will meet in the sector.
 *
 * Named by the people who ride there, which is why they are worth showing at
 * all: "la montée du moulin plein" tells a local rider more than a gradient
 * does. Steepness is coloured in a road cyclist's bands, the same ones the
 * course profile uses, so the two read as one language.
 */

function toneFor(grade: number): string {
  if (grade >= 9) return "text-destructive";
  if (grade >= 6) return "text-ufolep";
  if (grade >= 4) return "text-accent";
  return "text-muted-foreground";
}

export async function RaceClimbs({
  raceId,
  hasTrace,
}: {
  raceId: string;
  /** When the course itself is known, these are context rather than the answer. */
  hasTrace: boolean;
}) {
  let climbs: Awaited<ReturnType<typeof getRaceClimbs>> = [];
  try {
    climbs = await getRaceClimbs(raceId);
  } catch {
    return null;
  }

  if (climbs.length === 0) return null;

  return (
    <section>
      <SectionHeading icon={TrendingUp}>
        Les difficultés du secteur
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {hasTrace ? "autour du parcours" : "autour du départ"}
        </span>
      </SectionHeading>

      <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface-1">
        {climbs.map((c) => (
          <a
            key={c.segmentId}
            href={`https://www.strava.com/segments/${c.segmentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium group-hover:text-primary">
                {c.name}
              </div>
              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                {(c.distanceM / 1000).toFixed(1)} km
                {c.elevationM !== null && ` · ${Math.round(c.elevationM)} m`}
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 font-mono text-sm font-medium tabular-nums",
                toneFor(c.averageGrade)
              )}
            >
              {c.averageGrade.toFixed(1)} %
            </span>
          </a>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Segments Strava du secteur, nommés par les coureurs qui y roulent.
        {!hasTrace && " Le parcours exact n'est pas connu : ce sont les difficultés du terrain, pas nécessairement celles de la course."}
      </p>
    </section>
  );
}

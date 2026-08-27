import Link from "next/link";
import { History } from "lucide-react";
import { getPastEditions } from "@/lib/db/queries/race-detail";
import { displayRaceName } from "@/lib/race-name";
import { SectionHeading } from "./StartList";

const MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/**
 * What happened here before.
 *
 * The reason meeting identity was worth rebuilding. Who won it last time and
 * how many turned up are the two questions that decide whether a race is worth
 * the drive, and neither could be answered while every edition was its own
 * unrelated row.
 */
export async function PastEditions({ raceId }: { raceId: string }) {
  let editions: Awaited<ReturnType<typeof getPastEditions>> = [];
  try {
    editions = await getPastEditions(raceId);
  } catch {
    return null;
  }

  if (editions.length === 0) return null;

  return (
    <section>
      <SectionHeading icon={History}>Éditions précédentes</SectionHeading>
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface-1">
        {editions.map((e) => {
          const d = new Date(`${e.date}T12:00:00Z`);
          return (
            <Link
              key={e.raceId}
              href={`/course/${e.raceId}`}
              className="group flex items-center gap-3 px-3 py-2.5"
            >
              <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {String(d.getUTCFullYear()).slice(2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm group-hover:text-primary">
                  {displayRaceName(e.name)}
                </div>
                {e.winner && (
                  <div className="truncate text-xs text-muted-foreground">
                    <span className="text-accent">1<sup>er</sup></span>{" "}
                    {e.winner.name}
                    {e.winner.club && ` · ${e.winner.club}`}
                  </div>
                )}
              </div>
              {e.starters > 0 && (
                <span
                  className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                  title="Coureurs classés"
                >
                  {e.starters}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

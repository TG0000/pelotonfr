import Link from "next/link";
import { Layers } from "lucide-react";
import { getSiblingRaces } from "@/lib/db/queries/race-detail";
import { displayRaceName } from "@/lib/race-name";
import { CategorySummary } from "./RacePrimitives";
import { SectionHeading } from "./StartList";

/**
 * The other fields of the same meeting.
 *
 * The federation publishes each category as its own competition, so a rider
 * arriving at Le Creusot on 30 November is looking at one of five races run
 * that afternoon. Listing them stops the page pretending this is a standalone
 * event, and lets a rider find the field they are actually entitled to.
 */
export async function SiblingRaces({ raceId }: { raceId: string }) {
  let siblings: Awaited<ReturnType<typeof getSiblingRaces>> = [];
  try {
    siblings = await getSiblingRaces(raceId);
  } catch {
    return null;
  }

  if (siblings.length === 0) return null;

  return (
    <section>
      <SectionHeading icon={Layers}>
        Les autres courses du jour
        <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted-foreground">
          {siblings.length}
        </span>
      </SectionHeading>
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface-1">
        {siblings.map((s) => (
          <Link
            key={s.id}
            href={`/course/${s.id}`}
            className="group flex items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium group-hover:text-primary">
                {displayRaceName(s.name)}
              </div>
              <CategorySummary categories={s.categories} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

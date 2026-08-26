import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import type { Race } from "@/types";
import { cn } from "@/lib/utils";
import { displayRaceName } from "@/lib/race-name";
import {
  CategorySummary,
  DateBlock,
  DisciplineTag,
  DistanceTag,
  FEDERATION_COLOR,
  FederationMark,
  parseRaceDate,
} from "./RacePrimitives";

interface RaceCardProps {
  race: Race;
  showDistance?: boolean;
  /** The viewer's categories, so their own races stand out in a long list. */
  myCategories?: string[];
  /** Today, as YYYY-MM-DD. Passed in rather than read here so the card renders
      from its props alone and the server and client agree on the date. */
  today?: string;
}

/**
 * One race, as a row.
 *
 * A three-column grid of boxed cards looked designed but scanned badly: the eye
 * had to restart at every card. A single column with the date pinned to a fixed
 * left gutter lets a rider run straight down the dates, which is how anyone
 * actually reads a calendar.
 */
export function RaceCard({
  race,
  showDistance,
  myCategories,
  today,
}: RaceCardProps) {
  const date = parseRaceDate(race.raceDate);
  const now = today ? parseRaceDate(today).getTime() : null;
  const isSoon =
    now != null &&
    date.getTime() >= now &&
    date.getTime() - now < 7 * 24 * 60 * 60 * 1000;

  return (
    <Link
      href={`/course/${race.id}`}
      className={cn(
        "group relative flex items-center gap-4 px-3 py-3 sm:px-4",
        "rounded-xl border border-transparent bg-surface-1",
        "transition-colors hover:border-border hover:bg-surface-2",
        race.isCancelled && "opacity-60"
      )}
    >
      {/* The federation is a colour on the edge, not another badge competing
          with the race name. */}
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full opacity-70"
        style={{ background: FEDERATION_COLOR[race.federationSlug] ?? "var(--primary)" }}
      />

      <DateBlock
        date={race.raceDate}
        dateEnd={race.raceDateEnd}
        className={isSoon ? "text-primary" : undefined}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              "font-semibold leading-snug truncate transition-colors",
              "group-hover:text-primary",
              race.isCancelled && "line-through"
            )}
          >
            {displayRaceName(race.name)}
          </h3>
          {race.isCancelled && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              Annulée
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 min-w-0">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate">
            {race.city}
            {race.departmentCode && (
              <span className="text-muted-foreground/70"> ({race.departmentCode})</span>
            )}
          </span>
          <DisciplineTag discipline={race.discipline} raceType={race.raceType} />
        </div>

        <div className="mt-1 flex items-center gap-2 min-w-0">
          <FederationMark slug={race.federationSlug} withLabel />
          <CategorySummary
            categories={race.categories}
            highlight={myCategories}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {showDistance && <DistanceTag km={race.distanceFromUserKm} />}
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

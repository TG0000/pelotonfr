import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import type { Race } from "@/types";
import { cn } from "@/lib/utils";
import { PlanButton } from "./PlanButton";
import { displayRaceName } from "@/lib/race-name";
import {
  CategorySummary,
  DateBlock,
  DisciplineTag,
  DistanceTag,
  FEDERATION_BG,
  FederationMark,
  parseRaceDate,
  PlaceLabel,
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
        className={cn(
          "absolute bottom-3 left-0 top-3 w-[3px] rounded-full opacity-70",
          FEDERATION_BG[race.federationSlug] ?? "bg-primary"
        )}
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
          <PlaceLabel race={race} className="text-sm text-muted-foreground" />
          <DisciplineTag discipline={race.discipline} raceType={race.raceType} />
        </div>

        <div className="mt-1 flex items-center gap-2 min-w-0">
          <FederationMark slug={race.federationSlug} withLabel />
          <CategorySummary
            categories={race.categories}
            highlight={myCategories}
          />
          {/* La date que personne ne voit à temps : la clôture des engagements,
              quand elle tombe dans la semaine. Déduite, elle est marquée. */}
          {(() => {
            if (!race.entriesCloseAt || now === null) return null;
            const hours = (new Date(race.entriesCloseAt).getTime() - now) / 3_600_000;
            if (hours < 0 || hours > 24 * 7) return null;
            const days = Math.floor(hours / 24);
            const label = hours < 24 ? `clôture ${hours < 1 ? "imminente" : `dans ${Math.floor(hours)} h`}` : `clôture dans ${days} j`;
            return (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
                  hours < 48 ? "bg-destructive/15 text-destructive" : "bg-ufolep/15 text-ufolep"
                )}
                title={race.entriesCloseSource === "fiche" ? "Clôture lue sur la fiche de l'organisateur" : "Clôture déduite de l'usage — à vérifier"}
              >
                {label}{race.entriesCloseSource !== "fiche" ? " ?" : ""}
              </span>
            );
          })()}
          {race.clubGoing != null && race.clubGoing > 0 && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-primary" title="Coéquipiers qui ont cette course au calendrier">
              {race.clubGoing} du club
            </span>
          )}
          {/* Le temps prévu au départ, quand la course est dans la semaine. */}
          {race.forecast && (
            <span
              className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
              title={`Au départ : vent ${Math.round(race.forecast.windKmh)} km/h${race.forecast.gustKmh ? `, rafales ${Math.round(race.forecast.gustKmh)}` : ""}${race.forecast.rainPct != null ? `, pluie ${race.forecast.rainPct} %` : ""}${race.forecast.tempC != null ? `, ${Math.round(race.forecast.tempC)} °C` : ""}`}
            >
              {Math.round(race.forecast.windKmh)} km/h
              {race.forecast.rainPct != null && race.forecast.rainPct >= 30 ? ` · ${race.forecast.rainPct} % pluie` : ""}
              {race.forecast.tempC != null ? ` · ${Math.round(race.forecast.tempC)} °` : ""}
            </span>
          )}
          {/* Faute d'engagés connus, ce que l'édition d'avant a rassemblé. */}
          {!race.entrantCount && !race.entriesEngaged && race.previousFinishers != null && race.previousFinishers > 0 && (
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground" title="Classés de l'édition précédente">
              l&apos;an dernier : {race.previousFinishers}
            </span>
          )}
          {/* La liste publiée d'abord ; à défaut, le compteur de la fiche. */}
          {(() => {
            const n = race.entrantCount || race.entriesEngaged || 0;
            if (n <= 0) return null;
            return (
              <span
                className="ml-auto shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                title={race.entrantCount ? "Liste des engagés publiée" : race.entriesCapacity ? `${n} engagés sur ${race.entriesCapacity} places` : undefined}
              >
                {n} engagé{n > 1 ? "s" : ""}
              </span>
            );
          })()}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showDistance && <DistanceTag km={race.distanceFromUserKm} />}
        <PlanButton raceId={race.id} compact />
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

import Link from "next/link";
import { MapPin } from "lucide-react";
import { calendarName, displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";
import type { Race, RaceMarker } from "@/types";
import {
  CategorySummary,
  FEDERATION_BG,
  FederationMark,
  PlaceLabel,
  placeLabel,
} from "./RacePrimitives";

export const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const WEEKDAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

/** A calendar day as a plain key, immune to timezone drift. */
export function dayKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The six-week block a month is drawn in.
 *
 * Always six rows: a grid that changes height as the rider pages through the
 * season makes the whole layout jump under the cursor.
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  // Monday-first, as every French calendar is printed.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return dayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  });
}

/**
 * Places each race on every day it actually runs.
 *
 * Grouping by start date alone hid stage races from every day but their first.
 * A span beyond a fortnight is left on its opening day: those are data errors —
 * a season-long "event" — and letting them paint the whole grid buries the rest.
 */
const MAX_SPAN_DAYS = 14;

export function racesByDay(races: RaceMarker[]): Map<string, RaceMarker[]> {
  const byDay = new Map<string, RaceMarker[]>();

  const push = (day: string, race: RaceMarker) => {
    const list = byDay.get(day);
    if (list) list.push(race);
    else byDay.set(day, [race]);
  };

  for (const race of races) {
    const start = new Date(`${race.raceDate}T12:00:00Z`);
    const end = race.raceDateEnd ? new Date(`${race.raceDateEnd}T12:00:00Z`) : start;
    const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (span <= 1 || span > MAX_SPAN_DAYS) {
      push(race.raceDate, race);
      continue;
    }
    for (let i = 0; i < span; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      push(dayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), race);
    }
  }
  return byDay;
}

/** Quatre courses lisibles valent mieux que trois et un « +90 » plus tôt. */
const CELL_RACES = 4;

/** Les jours, sept par sept. */
function weeksOf(days: string[]): string[][] {
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Les courses qui durent plusieurs jours, sans doublon — une par identité. */
function spanningRaces(byDay: Map<string, RaceMarker[]>): Map<string, RaceMarker> {
  const out = new Map<string, RaceMarker>();
  for (const races of byDay.values()) {
    for (const race of races) {
      if (!race.raceDateEnd || race.raceDateEnd === race.raceDate) continue;
      const span =
        Math.round(
          (Date.parse(`${race.raceDateEnd}T12:00:00Z`) - Date.parse(`${race.raceDate}T12:00:00Z`)) /
            86_400_000
        ) + 1;
      if (span > 1 && span <= MAX_SPAN_DAYS) out.set(race.id, race);
    }
  }
  return out;
}

interface Bar {
  race: RaceMarker;
  /** Colonnes de la semaine, de 0 à 6, incluses. */
  from: number;
  to: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Les barres d'une semaine, rangées en couloirs pour ne pas se chevaucher.
 * La plus longue prend le premier couloir : c'est elle qu'on lit d'abord.
 */
function barsForWeek(week: string[], spanning: Map<string, RaceMarker>): Bar[] {
  const first = week[0];
  const last = week[week.length - 1];
  const bars: Bar[] = [];

  for (const race of spanning.values()) {
    const end = race.raceDateEnd!;
    if (end < first || race.raceDate > last) continue;
    const from = race.raceDate < first ? 0 : week.indexOf(race.raceDate);
    const to = end > last ? week.length - 1 : week.indexOf(end);
    if (from < 0 || to < 0) continue;
    bars.push({
      race,
      from,
      to,
      lane: 0,
      continuesBefore: race.raceDate < first,
      continuesAfter: end > last,
    });
  }

  bars.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from);
  const taken: Array<Array<[number, number]>> = [];
  for (const bar of bars) {
    let lane = 0;
    while (taken[lane]?.some(([f, t]) => bar.from <= t && bar.to >= f)) lane++;
    bar.lane = lane;
    (taken[lane] ??= []).push([bar.from, bar.to]);
  }
  return bars;
}

interface MonthGridProps {
  year: number;
  month: number;
  days: string[];
  byDay: Map<string, RaceMarker[]>;
  /** Les courses du jour choisi, entières : leur carte en a besoin. */
  selectedRaces: Race[];
  today: string;
  selectedDay: string;
  /** Builds the href for a day cell, so the page owns URL shape. */
  dayHref: (day: string) => string;
  closeHref: string;
}

export function MonthGrid({
  month,
  days,
  byDay,
  selectedRaces,
  today,
  selectedDay,
  dayHref,
  closeHref,
}: MonthGridProps) {
  const weeks = weeksOf(days);
  const spanning = spanningRaces(byDay);

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Semaine par semaine : les courses par étapes courent en barres
            au-dessus des cases, à cheval sur leurs jours — le Tour de l'Orne
            est une seule course du samedi au dimanche, pas deux mentions. */}
        {weeks.map((week, w) => {
          const bars = barsForWeek(week, spanning);
          const lanes = bars.length ? Math.max(...bars.map((b) => b.lane)) + 1 : 0;
          return (
            <div key={week[0]} className="relative">
              {lanes > 0 && (
                <div
                  className="grid grid-cols-7 gap-y-0.5 px-1 pt-1"
                  style={{ gridTemplateRows: `repeat(${lanes}, minmax(0, 1fr))` }}
                >
                  {bars.map((bar) => (
                    <Link
                      key={`${week[0]}-${bar.race.id}`}
                      href={`/course/${bar.race.id}`}
                      title={`${displayRaceName(bar.race.name)} — ${placeLabel(bar.race).text}`}
                      style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.lane + 1 }}
                      className={cn(
                        "truncate px-1.5 py-0.5 text-[11px] font-medium leading-tight text-primary-foreground hover:brightness-110",
                        FEDERATION_BG[bar.race.federationSlug] ?? "bg-primary",
                        bar.continuesBefore ? "rounded-l-none" : "rounded-l",
                        bar.continuesAfter ? "rounded-r-none" : "rounded-r"
                      )}
                    >
                      {calendarName(bar.race.name)}
                    </Link>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-7">
                {week.map((day, d) => {
                  const i = w * 7 + d;
                  const dayRaces = (byDay.get(day) ?? []).filter((r) => !spanning.has(r.id));
                  const inMonth = Number(day.slice(5, 7)) - 1 === month;
                  const isToday = day === today;
                  const isSelected = day === selectedDay;

                  return (
                    <div
                      key={day}
                      className={cn(
                        "min-h-32 border-b border-r border-border/60 p-1.5",
                        d === 6 && "border-r-0",
                        i >= days.length - 7 && "border-b-0",
                        !inMonth && "bg-surface-2/40",
                        isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between px-0.5">
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            isToday
                              ? "grid size-5 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
                              : inMonth
                                ? "font-medium"
                                : "text-muted-foreground/50"
                          )}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                        {dayRaces.length > CELL_RACES && (
                          <Link
                            href={`${dayHref(day)}#jour`}
                            className="font-mono text-[10px] font-medium tabular-nums text-primary hover:underline"
                          >
                            +{dayRaces.length - CELL_RACES}
                          </Link>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        {dayRaces.slice(0, CELL_RACES).map((race) => (
                          <Link
                            key={`${day}-${race.id}`}
                            href={`/course/${race.id}`}
                            title={`${displayRaceName(race.name)} — ${placeLabel(race).text}`}
                            className="flex items-start gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-surface-3"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "mt-1 size-1.5 shrink-0 rounded-full",
                                FEDERATION_BG[race.federationSlug] ?? "bg-primary"
                              )}
                            />
                            <span className="line-clamp-2">{calendarName(race.name)}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && selectedRaces.length > 0 && (
        <section
          id="jour"
          className="mt-6 rounded-2xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {Number(selectedDay.slice(8, 10))}{" "}
              {MONTHS[Number(selectedDay.slice(5, 7)) - 1]}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {selectedRaces.length} course{selectedRaces.length > 1 ? "s" : ""}
              </span>
            </h2>
            <Link
              href={closeHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Fermer
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {selectedRaces.map((race) => (
              <Link
                key={race.id}
                href={`/course/${race.id}`}
                className="group flex items-center gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium group-hover:text-primary">
                    {displayRaceName(race.name)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    <PlaceLabel race={race} />
                  </div>
                </div>
                <FederationMark slug={race.federationSlug} withLabel />
                <CategorySummary
                  categories={race.categories}
                  className="hidden max-w-48 sm:inline"
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Mobile: an agenda, because a 7-column grid on a phone is unreadable. */}
      <div className="flex flex-col gap-4 md:hidden">
        {days
          .filter((d) => Number(d.slice(5, 7)) - 1 === month && byDay.has(d))
          .map((day) => (
            <div key={day}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-semibold capitalize">
                  {WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]}{" "}
                  {Number(day.slice(8, 10))} {MONTHS[month]}
                </span>
                {day === today && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    aujourd&apos;hui
                  </span>
                )}
              </div>
              <div className="divide-y divide-border/60 rounded-xl border border-border">
                {(byDay.get(day) ?? []).map((race) => (
                  <Link
                    key={race.id}
                    href={`/course/${race.id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-8 w-[3px] shrink-0 rounded-full",
                        FEDERATION_BG[race.federationSlug] ?? "bg-primary"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {displayRaceName(race.name)}
                      </div>
                      <PlaceLabel
                        race={race}
                        className="block text-xs text-muted-foreground"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { MapPin } from "lucide-react";
import { displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";
import type { Race } from "@/types";
import {
  CategorySummary,
  FEDERATION_COLOR,
  FederationMark,
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

export function racesByDay(races: Race[]): Map<string, Race[]> {
  const byDay = new Map<string, Race[]>();

  const push = (day: string, race: Race) => {
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

interface MonthGridProps {
  year: number;
  month: number;
  days: string[];
  byDay: Map<string, Race[]>;
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
  today,
  selectedDay,
  dayHref,
  closeHref,
}: MonthGridProps) {
  const selectedRaces = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

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

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayRaces = byDay.get(day) ?? [];
            const inMonth = Number(day.slice(5, 7)) - 1 === month;
            const isToday = day === today;
            const isSelected = day === selectedDay;

            return (
              <div
                key={day}
                className={cn(
                  "min-h-28 border-b border-r border-border/60 p-1.5",
                  i % 7 === 6 && "border-r-0",
                  i >= 35 && "border-b-0",
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
                  {dayRaces.length > 3 && (
                    <Link
                      href={`${dayHref(day)}#jour`}
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      +{dayRaces.length - 3}
                    </Link>
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  {dayRaces.slice(0, 3).map((race) => (
                    <Link
                      key={`${day}-${race.id}`}
                      href={`/course/${race.id}`}
                      title={`${displayRaceName(race.name)} — ${race.city}`}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-surface-3"
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          background:
                            FEDERATION_COLOR[race.federationSlug] ?? "var(--primary)",
                        }}
                      />
                      <span className="truncate">{displayRaceName(race.name)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
                    {race.city}
                    {race.departmentCode && ` (${race.departmentCode})`}
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
                      className="h-8 w-[3px] shrink-0 rounded-full"
                      style={{
                        background:
                          FEDERATION_COLOR[race.federationSlug] ?? "var(--primary)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {displayRaceName(race.name)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {race.city}
                        {race.departmentCode && ` (${race.departmentCode})`}
                      </div>
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

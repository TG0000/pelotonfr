import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal } from "lucide-react";
import { getRacesForCalendar, getRaces, getRacesForMap } from "@/lib/db/queries/races";
import { RaceFilters } from "@/components/races/RaceFilters";
import { MobileFilters } from "@/components/races/MobileFilters";
import { ActiveFilters } from "@/components/races/ActiveFilters";
import { RaceCard } from "@/components/races/RaceCard";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/States";
import { MapClient } from "@/components/map/MapClient";
import { ViewSwitcher, type RaceView } from "@/components/races/ViewSwitcher";
import {
  MONTHS,
  MonthGrid,
  dayKey,
  monthGrid,
  racesByDay,
} from "@/components/races/MonthGrid";
import { todayISO } from "@/lib/date";
import type { Race, PaginatedRaces } from "@/types";
import type { FederationSlug, Discipline } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Calendrier des courses",
  description:
    "Filtrez les courses par période, fédération et catégorie, puis lisez-les en calendrier, en liste ou sur la carte.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getString(val: string | string[] | undefined): string {
  if (!val) return "";
  return Array.isArray(val) ? (val[0] ?? "") : val;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isView(value: string): value is RaceView {
  return value === "liste" || value === "carte" || value === "calendrier";
}

/** Keeps every filter, replacing only what the caller names. */
function buildQuery(
  base: Record<string, string | string[]>,
  overrides: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (key in overrides) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) params.append(key, v);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function CalendrierPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const base = params as Record<string, string | string[]>;

  const viewParam = getString(params.vue);
  const view: RaceView = isView(viewParam) ? viewParam : "calendrier";

  const today = todayISO();
  const dateFrom = ISO_DATE.test(getString(params.dateFrom))
    ? getString(params.dateFrom)
    : "";
  const dateTo = ISO_DATE.test(getString(params.dateTo))
    ? getString(params.dateTo)
    : "";

  const shared = {
    fed: getArray(params.fed) as FederationSlug[],
    disc: getArray(params.disc) as Discipline[],
    cat: getArray(params.cat),
    q: getString(params.q),
  };

  /* The month on screen follows the period, so switching views never loses
     what the rider had narrowed down. */
  const anchor = dateFrom || today;
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;

  const days = monthGrid(year, month);
  const gridStart = days[0];
  const gridEnd = days[days.length - 1];

  let calendarRaces: Race[] = [];
  let listResult: PaginatedRaces = {
    races: [], total: 0, page: 1, pageSize: 24, totalPages: 0,
  };
  let mapRaces: Race[] = [];

  try {
    if (view === "calendrier") {
      const calendarDays = await getRacesForCalendar({
        ...shared,
        // Clamped to the block on screen, but never beyond a period the rider
        // has explicitly asked for.
        dateFrom: dateFrom && dateFrom > gridStart ? dateFrom : gridStart,
        dateTo: dateTo && dateTo < gridEnd ? dateTo : gridEnd,
      });
      calendarRaces = calendarDays.flatMap((d) => d.races);
    } else if (view === "liste") {
      listResult = await getRaces({
        ...shared,
        dateFrom,
        dateTo,
        page: Number(getString(params.page)) || 1,
        lat: params.lat ? Number(params.lat) : null,
        lng: params.lng ? Number(params.lng) : null,
        radius: Number(getString(params.radius)) || 50,
        sortBy: "date_asc",
      });
    } else {
      mapRaces = await getRacesForMap({
        ...shared,
        dateFrom,
        dateTo,
        lat: params.lat ? Number(params.lat) : null,
        lng: params.lng ? Number(params.lng) : null,
        radius: Number(getString(params.radius)) || 50,
      });
    }
  } catch {
    // DB not configured
  }

  const byDay = racesByDay(calendarRaces);
  const selectedDay = ISO_DATE.test(getString(params.jour))
    ? getString(params.jour)
    : "";

  const prevMonth = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const monthPeriod = (d: Date) => ({
    dateFrom: dayKey(d.getUTCFullYear(), d.getUTCMonth(), 1),
    dateTo: dayKey(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    ),
  });

  const count =
    view === "calendrier"
      ? calendarRaces.length
      : view === "liste"
        ? listResult.total
        : mapRaces.length;

  /* Capitalised here rather than with a CSS `capitalize`, which title-cases
     every word and turned "toutes les courses à venir" into a headline that
     shouted each preposition. */
  const rawHeading =
    view === "calendrier"
      ? `${MONTHS[month]} ${year}`
      : dateFrom || dateTo
        ? "sur la période choisie"
        : "toutes les courses à venir";
  const heading = rawHeading.charAt(0).toUpperCase() + rawHeading.slice(1);

  return (
    <div
      className={
        view === "carte"
          ? "fixed inset-x-0 bottom-0 top-14 flex flex-col"
          : "mx-auto w-full max-w-7xl px-4 py-8"
      }
    >
      <header
        className={
          view === "carte"
            ? "flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3"
            : "mb-6 flex flex-wrap items-center justify-between gap-4"
        }
      >
        <div>
          <h1
            className={
              view === "carte" ? "text-lg font-bold" : "text-3xl font-bold"
            }
          >
            {heading}
          </h1>
          {view !== "carte" && (
            <p className="text-sm text-muted-foreground">
              {count > 0
                ? `${count.toLocaleString("fr-FR")} course${count > 1 ? "s" : ""}`
                : "Aucune course sur cette période"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {view === "calendrier" && (
            <div className="flex items-center gap-1">
              <Link
                href={`/calendrier${buildQuery(base, { ...monthPeriod(prevMonth), jour: undefined })}`}
                aria-label="Mois précédent"
                className="rounded-lg border border-border p-2 hover:bg-surface-2"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                href={`/calendrier${buildQuery(base, { dateFrom: undefined, dateTo: undefined, jour: undefined })}`}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Aujourd&apos;hui
              </Link>
              <Link
                href={`/calendrier${buildQuery(base, { ...monthPeriod(nextMonth), jour: undefined })}`}
                aria-label="Mois suivant"
                className="rounded-lg border border-border p-2 hover:bg-surface-2"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          )}
          <Suspense fallback={null}>
            <ViewSwitcher current={view} />
          </Suspense>
          <div className="lg:hidden">
            <Suspense fallback={null}>
              <MobileFilters showLocation={view !== "calendrier"} />
            </Suspense>
          </div>
        </div>
      </header>

      {view === "carte" ? (
        <div className="min-h-0 flex-1">
          <MapClient races={mapRaces} />
        </div>
      ) : (
        <div className="flex gap-8">
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
              <div className="mb-4 flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Filtres</h2>
              </div>
              <Suspense fallback={null}>
                <RaceFilters showLocation={view === "liste"} />
              </Suspense>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-4">
              <Suspense fallback={null}>
                <ActiveFilters />
              </Suspense>
            </div>

            {view === "calendrier" ? (
              <MonthGrid
                year={year}
                month={month}
                days={days}
                byDay={byDay}
                today={today}
                selectedDay={selectedDay}
                dayHref={(day) => `/calendrier${buildQuery(base, { jour: day })}`}
                closeHref={`/calendrier${buildQuery(base, { jour: undefined })}`}
              />
            ) : listResult.races.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Aucune course ne correspond"
                action="Élargissez la période ou retirez une catégorie."
              />
            ) : (
              <>
                <div className="flex flex-col divide-y divide-border/60">
                  {listResult.races.map((race) => (
                    <RaceCard
                      key={race.id}
                      race={race}
                      showDistance={params.lat != null}
                      myCategories={shared.cat}
                      today={today}
                    />
                  ))}
                </div>
                <div className="mt-8">
                  <Suspense fallback={null}>
                    <Pagination
                      page={listResult.page}
                      totalPages={listResult.totalPages}
                      total={listResult.total}
                    />
                  </Suspense>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

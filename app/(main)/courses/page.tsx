import { Suspense } from "react";
import { SlidersHorizontal, SearchX } from "lucide-react";
import { RaceCard } from "@/components/races/RaceCard";
import { RaceFilters } from "@/components/races/RaceFilters";
import { MobileFilters } from "@/components/races/MobileFilters";
import { ActiveFilters } from "@/components/races/ActiveFilters";
import { SortSelect } from "@/components/races/SortSelect";
import { Pagination } from "@/components/common/Pagination";
import { getRaces } from "@/lib/db/queries/races";
import { parseRaceDate } from "@/components/races/RacePrimitives";
import { todayISO } from "@/lib/date";
import type { Race, RaceFilters as Filters, PaginatedRaces } from "@/types";
import type { FederationSlug, Discipline } from "@/lib/constants";

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

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Splits the page into months.
 *
 * Only meaningful when the list is in date order — sorted by distance, a month
 * heading would appear and reappear at random, so the caller opts in.
 */
function groupByMonth(races: Race[]): Array<{ key: string; label: string; races: Race[] }> {
  const groups: Array<{ key: string; label: string; races: Race[] }> = [];
  for (const race of races) {
    const d = parseRaceDate(race.raceDate);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.races.push(race);
    } else {
      groups.push({
        key,
        label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        races: [race],
      });
    }
  }
  return groups;
}

export default async function CoursesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters: Partial<Filters> = {
    fed: getArray(params.fed) as FederationSlug[],
    disc: getArray(params.disc) as Discipline[],
    cat: getArray(params.cat),
    dateFrom: getString(params.dateFrom),
    dateTo: getString(params.dateTo),
    q: getString(params.q),
    page: Number(getString(params.page)) || 1,
    lat: params.lat ? Number(params.lat) : null,
    lng: params.lng ? Number(params.lng) : null,
    radius: Number(getString(params.radius)) || 50,
    sortBy: (getString(params.sortBy) as Filters["sortBy"]) || "date_asc",
  };

  let result: PaginatedRaces = {
    races: [], total: 0, page: 1, pageSize: 24, totalPages: 0,
  };
  try {
    result = await getRaces(filters);
  } catch {
    // DB not configured
  }

  const { races, total, page, totalPages } = result;
  const today = todayISO();
  const byDate = filters.sortBy?.startsWith("date") ?? true;
  const groups = byDate
    ? groupByMonth(races)
    : [{ key: "all", label: "", races }];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("fr-FR")} course${total > 1 ? "s" : ""} à venir · FFC, FSGT et UFOLEP`
              : "Toutes les compétitions FFC, FSGT et UFOLEP"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Suspense fallback={null}>
            <SortSelect />
          </Suspense>
          <Suspense fallback={null}>
            <MobileFilters showLocation />
          </Suspense>
        </div>
      </header>

      <div className="mb-4 lg:hidden">
        <Suspense fallback={null}>
          <ActiveFilters />
        </Suspense>
      </div>

      <div className="flex gap-8">
        <div className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Filtres</h2>
            </div>
            <Suspense fallback={null}>
              <RaceFilters showLocation />
            </Suspense>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-4 hidden items-center justify-between gap-4 lg:flex">
            <Suspense fallback={null}>
              <ActiveFilters />
            </Suspense>
            <div className="ml-auto shrink-0">
              <Suspense fallback={null}>
                <SortSelect />
              </Suspense>
            </div>
          </div>

          {races.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-20 text-center">
              <SearchX className="mx-auto mb-4 size-10 text-muted-foreground/40" />
              <p className="mb-1 font-medium">Aucune course ne correspond</p>
              <p className="text-sm text-muted-foreground">
                Élargissez la période ou retirez une catégorie.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6">
                {groups.map((group) => (
                  <section key={group.key}>
                    {group.label && (
                      <h2 className="sticky top-16 z-10 -mx-1 mb-1 bg-background/85 px-1 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                        {group.label}
                      </h2>
                    )}
                    <div className="flex flex-col divide-y divide-border/60">
                      {group.races.map((race) => (
                        <RaceCard
                          key={race.id}
                          race={race}
                          showDistance={filters.lat != null}
                          myCategories={filters.cat}
                          today={today}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="mt-8">
                <Suspense fallback={null}>
                  <Pagination page={page} totalPages={totalPages} total={total} />
                </Suspense>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

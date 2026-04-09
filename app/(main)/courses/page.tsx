import { Suspense } from "react";
import { SlidersHorizontal } from "lucide-react";
import { RaceCard } from "@/components/races/RaceCard";
import { RaceFilters } from "@/components/races/RaceFilters";
import { MobileFilters } from "@/components/races/MobileFilters";
import { Pagination } from "@/components/common/Pagination";
import { getRaces } from "@/lib/db/queries/races";
import type { RaceFilters as Filters, PaginatedRaces } from "@/types";
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
  return Array.isArray(val) ? val[0] ?? "" : val;
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
  };

  let result: PaginatedRaces = { races: [], total: 0, page: 1, pageSize: 24, totalPages: 0 };
  try {
    result = await getRaces(filters);
  } catch {
    // DB not configured
  }

  const { races, total, page, totalPages } = result;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 w-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Courses cyclistes</h1>
          <p className="text-muted-foreground text-sm">
            {total > 0
              ? `${total} course${total > 1 ? "s" : ""} trouvée${total > 1 ? "s" : ""}`
              : "Toutes les compétitions FFC, FSGT et UFOLEP"}
          </p>
        </div>
        {/* Mobile filter button */}
        <div className="lg:hidden shrink-0">
          <Suspense fallback={null}>
            <MobileFilters showLocation />
          </Suspense>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Filtres</h2>
            </div>
            <Suspense fallback={null}>
              <RaceFilters showLocation />
            </Suspense>
          </div>
        </div>

        {/* Race grid */}
        <div className="flex-1 min-w-0">
          {races.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-2">Aucune course trouvée</p>
              <p className="text-sm">Essayez de modifier vos filtres.</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {races.map((race) => (
                  <RaceCard
                    key={race.id}
                    race={race}
                    showDistance={filters.lat != null}
                  />
                ))}
              </div>

              <Suspense fallback={null}>
                <Pagination page={page} totalPages={totalPages} total={total} />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

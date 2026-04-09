import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { getRacesForCalendar } from "@/lib/db/queries/races";
import type { CalendarDay } from "@/lib/db/queries/races";
import { RaceFilters } from "@/components/races/RaceFilters";
import { RaceBadge, FederationDot } from "@/components/races/RaceBadge";
import type { FederationSlug, Discipline } from "@/lib/constants";
import { format, startOfWeek, isSameWeek } from "date-fns";
import { fr } from "date-fns/locale";

export const metadata: Metadata = {
  title: "Calendrier des courses",
  description: "Calendrier des courses cyclistes en France organisé par semaine",
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

function groupByWeek(days: CalendarDay[]): { weekStart: Date; days: CalendarDay[] }[] {
  const weeks: { weekStart: Date; days: CalendarDay[] }[] = [];
  for (const day of days) {
    const date = new Date(day.date + "T12:00:00Z");
    const ws = startOfWeek(date, { weekStartsOn: 1 });
    const existing = weeks.find((w) => isSameWeek(w.weekStart, date, { weekStartsOn: 1 }));
    if (existing) {
      existing.days.push(day);
    } else {
      weeks.push({ weekStart: ws, days: [day] });
    }
  }
  return weeks;
}

function getWeekendRange() {
  const now = new Date();
  const day = now.getDay();
  const sat = new Date(now);
  sat.setDate(now.getDate() + ((6 - day + 7) % 7 || 7));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { from: sat.toISOString().split("T")[0], to: sun.toISOString().split("T")[0] };
}

function getPresets() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const weekend = getWeekendRange();
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return [
    { label: "Ce week-end", from: weekend.from, to: weekend.to },
    { label: "7 prochains jours", from: today, to: weekEnd.toISOString().split("T")[0] },
    { label: "Ce mois", from: today, to: monthEnd.toISOString().split("T")[0] },
    { label: "Mois prochain", from: nextMonthStart.toISOString().split("T")[0], to: nextMonthEnd.toISOString().split("T")[0] },
  ];
}

export default async function CalendrierPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters = {
    fed: getArray(params.fed) as FederationSlug[],
    disc: getArray(params.disc) as Discipline[],
    cat: getArray(params.cat),
    dateFrom: getString(params.dateFrom),
    dateTo: getString(params.dateTo),
  };

  let calendarDays: CalendarDay[] = [];
  try {
    calendarDays = await getRacesForCalendar(filters);
  } catch {
    // DB not configured
  }

  const weeks = groupByWeek(calendarDays);
  const totalRaces = calendarDays.reduce((sum, d) => sum + d.races.length, 0);
  const presets = getPresets();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 w-full">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Calendrier</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {totalRaces > 0
            ? `${totalRaces} course${totalRaces > 1 ? "s" : ""} sur ${calendarDays.length} jour${calendarDays.length > 1 ? "s" : ""}`
            : "Aucune course trouvée"}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Raccourcis
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => {
                  const isActive = filters.dateFrom === preset.from && filters.dateTo === preset.to;
                  const fedParams = filters.fed.map((f) => `fed=${f}`).join("&");
                  const href = `/calendrier?dateFrom=${preset.from}&dateTo=${preset.to}${fedParams ? `&${fedParams}` : ""}`;
                  return (
                    <Link
                      key={preset.label}
                      href={href}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted"
                      }`}
                    >
                      {preset.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <Suspense fallback={null}>
              <RaceFilters />
            </Suspense>
          </div>
        </div>

        {/* Calendar content */}
        <div className="flex-1 min-w-0">
          {/* Mobile quick presets */}
          <div className="lg:hidden flex gap-2 flex-wrap mb-4 overflow-x-auto pb-1">
            {presets.map((preset) => (
              <Link
                key={preset.label}
                href={`/calendrier?dateFrom=${preset.from}&dateTo=${preset.to}`}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 hover:bg-muted transition-all whitespace-nowrap"
              >
                {preset.label}
              </Link>
            ))}
          </div>

          {weeks.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <CalendarDays className="size-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">Aucune course trouvée</p>
              <p className="text-sm">Essayez de modifier vos filtres ou la période.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {weeks.map(({ weekStart, days }) => (
                <div key={weekStart.toISOString()}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <h2 className="text-sm font-semibold text-muted-foreground shrink-0">
                      Semaine du{" "}
                      <span className="text-foreground">
                        {format(weekStart, "d MMMM", { locale: fr })}
                      </span>
                    </h2>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="flex flex-col gap-5">
                    {days.map(({ date, races }) => {
                      const d = new Date(date + "T12:00:00Z");
                      const dayName = format(d, "EEEE d MMMM", { locale: fr });

                      return (
                        <div key={date}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="capitalize text-sm font-semibold">{dayName}</span>
                            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {races.length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {races.map((race) => (
                              <Link
                                key={race.id}
                                href={`/course/${race.id}`}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all group"
                              >
                                <FederationDot slug={race.federationSlug} />
                                <span className="flex-1 text-sm font-medium group-hover:text-primary transition-colors truncate">
                                  {race.name}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <RaceBadge type="discipline" value={race.discipline} />
                                  <span className="text-xs text-muted-foreground hidden sm:block max-w-32 truncate">
                                    {race.city}
                                    {race.departmentCode && ` (${race.departmentCode})`}
                                  </span>
                                  <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

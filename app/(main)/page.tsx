import Link from "next/link";
import { ArrowRight, Map, List, Calendar, TrendingUp, Bike } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { RaceCard } from "@/components/races/RaceCard";
import { getUpcomingRaces, getRaceStats } from "@/lib/db/queries/races";
import { FEDERATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Race } from "@/types";
import type { RaceStats } from "@/lib/db/queries/races";

const FED_COLORS: Record<string, string> = {
  ffc: "bg-blue-500",
  fsgt: "bg-green-500",
  ufolep: "bg-orange-500",
};

export default async function HomePage() {
  let upcomingRaces: Race[] = [];
  let stats: RaceStats | null = null;

  try {
    [upcomingRaces, stats] = await Promise.all([
      getUpcomingRaces(8),
      getRaceStats(),
    ]);
  } catch {
    // DB not configured yet
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4 text-primary text-sm font-medium">
              <Bike className="size-4" />
              <span>Cyclisme amateur en France</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Toutes les courses{" "}
              <span className="text-primary">cyclistes</span>{" "}
              en un seul endroit
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Retrouvez les calendriers FFC, FSGT et UFOLEP sur une carte interactive.
              Filtrez par discipline, catégorie et distance depuis chez vous.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/carte"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                <Map className="size-4" />
                Voir la carte
              </Link>
              <Link
                href="/courses"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
              >
                <List className="size-4" />
                Toutes les courses
              </Link>
            </div>
          </div>

          {/* Federation badges */}
          <div className="flex flex-wrap gap-6 mt-10">
            {FEDERATIONS.map((fed) => (
              <div key={fed.slug} className="flex items-center gap-2">
                <div className={`size-2.5 rounded-full ${FED_COLORS[fed.slug] ?? "bg-primary"}`} />
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{fed.name}</span>
                  {stats?.byFederation[fed.slug] != null && (
                    <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                      {stats.byFederation[fed.slug]}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {stats && stats.total > 0 && (
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-4">
            <div className="flex flex-wrap gap-6 sm:gap-10 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                <span className="font-bold text-lg">{stats.total.toLocaleString("fr-FR")}</span>
                <span className="text-muted-foreground">courses à venir</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="font-semibold">{stats.thisWeek}</span>
                <span className="text-muted-foreground">cette semaine</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="font-semibold">{stats.nextMonth}</span>
                <span className="text-muted-foreground">dans les 30 jours</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-14 w-full">
        <div className="grid sm:grid-cols-3 gap-5 mb-14">
          {[
            {
              icon: Map,
              title: "Carte interactive",
              description:
                "Visualisez toutes les courses sur une carte de France. Trouvez rapidement les épreuves près de chez vous avec le filtre par rayon.",
            },
            {
              icon: List,
              title: "Filtres avancés",
              description:
                "Filtrez par fédération, discipline, catégorie et date. Exactement les courses qui vous correspondent.",
            },
            {
              icon: Calendar,
              title: "Mis à jour chaque jour",
              description:
                "FFC, FSGT, UFOLEP : toutes les fédérations agrégées automatiquement. Le calendrier est toujours à jour.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col gap-3 p-6 rounded-xl border bg-card hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>

        {/* Upcoming races */}
        {upcomingRaces.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">Prochaines courses</h2>
              <Link
                href="/courses"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}
              >
                Tout voir
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {upcomingRaces.map((race) => (
                <RaceCard key={race.id} race={race} />
              ))}
            </div>
          </div>
        )}

        {upcomingRaces.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bike className="size-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">Base de données non configurée</p>
            <p className="text-sm">
              Configurez DATABASE_URL et lancez le scraper pour commencer.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

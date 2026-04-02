import Link from "next/link";
import { ArrowRight, Map, List, Filter, Bike } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { RaceCard } from "@/components/races/RaceCard";
import { getUpcomingRaces } from "@/lib/db/queries/races";
import { FEDERATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Race } from "@/types";

export default async function HomePage() {
  let upcomingRaces: Race[] = [];
  try {
    upcomingRaces = await getUpcomingRaces(12);
  } catch {
    // DB not configured yet
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4 text-primary text-sm font-medium">
              <Bike className="size-4" />
              <span>Cyclisme amateur en France</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Toutes les courses{" "}
              <span className="text-primary">cyclistes</span> en un seul endroit
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
          <div className="flex flex-wrap gap-6 mt-12">
            {FEDERATIONS.map((fed) => (
              <div key={fed.slug} className="flex items-center gap-2">
                <div
                  className={`size-2.5 rounded-full ${
                    fed.slug === "ffc"
                      ? "bg-blue-500"
                      : fed.slug === "fsgt"
                      ? "bg-green-500"
                      : "bg-orange-500"
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{fed.name}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 w-full">
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: Map,
              title: "Carte interactive",
              description:
                "Visualisez toutes les courses sur une carte de France. Trouvez rapidement les épreuves près de chez vous.",
            },
            {
              icon: Filter,
              title: "Filtres avancés",
              description:
                "Filtrez par fédération, discipline, catégorie et distance. Exactement les courses qui vous correspondent.",
            },
            {
              icon: List,
              title: "Calendrier complet",
              description:
                "FFC, FSGT, UFOLEP : toutes les fédérations agrégées automatiquement chaque jour.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col gap-3 p-6 rounded-xl border bg-card"
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Prochaines courses</h2>
              <Link
                href="/courses"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
              >
                Toutes les courses
                <ArrowRight className="size-4" />
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
            <Bike className="size-12 mx-auto mb-4 opacity-30" />
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

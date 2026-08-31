import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, Building2, Calendar, ExternalLink, Mail,
  MapPin, Phone, Route, Trophy,
} from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { getRaceById } from "@/lib/db/queries/races";
import { RaceCompetitors } from "@/components/riders/RaceCompetitors";
import { StartList, SectionHeading } from "@/components/races/StartList";
import { RaceWeatherPanel } from "@/components/races/RaceWeather";
import { OrganiserBriefing } from "@/components/races/OrganiserBriefing";
import { RaceResults } from "@/components/races/RaceResults";
import { CancellationNotice } from "@/components/races/CancellationNotice";
import { RaceTerrain } from "@/components/races/RaceTerrain";
import { CircuitWithWind } from "@/components/races/CircuitWithWind";
import { FieldLevel } from "@/components/races/FieldLevel";
import { PlanButton } from "@/components/races/PlanButton";
import { RaceClimbs } from "@/components/races/RaceClimbs";
import { getRaceTrace, getMeasuredTiming } from "@/lib/db/queries/race-detail";
import { estimateTiming, type RaceTiming } from "@/lib/race-timing";
import { PastEditions } from "@/components/races/PastEditions";
import { SiblingRaces } from "@/components/races/SiblingRaces";
import {
  FederationMark, PlaceLabel, placeLabel,
} from "@/components/races/RacePrimitives";
import { categoryLabel } from "@/lib/categories";
import { displayRaceName } from "@/lib/race-name";
import { FEDERATIONS } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const race = await getRaceById(id);
    if (!race) return { title: "Course introuvable" };
    return {
      title: displayRaceName(race.name),
      description: `${displayRaceName(race.name)} — ${placeLabel(race).text} le ${format(
        new Date(`${race.raceDate}T12:00:00Z`), "d MMMM yyyy", { locale: fr }
      )}`,
    };
  } catch {
    return { title: "Course" };
  }
}

/** How long until the start, said the way a rider counts it down. */
function countdown(raceDate: string, today: string): string | null {
  const days = Math.round(
    (new Date(`${raceDate}T12:00:00Z`).getTime() -
      new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000
  );
  if (days < 0) return null;
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days <= 21) return `dans ${days} jours`;
  return null;
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <div className="h-4 w-32 animate-pulse rounded bg-surface-3" />
      <div className="rounded-xl border border-border p-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-surface-3/60" style={{ marginBottom: 6 }} />
        ))}
      </div>
    </div>
  );
}

export default async function RaceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let race;
  try {
    race = await getRaceById(id);
  } catch {
    // DB not configured
  }
  if (!race) notFound();

  // Fetched here rather than in a Suspense boundary: the circuit is the
  // headline of the page when it exists, and a placeholder that resolves to
  // nothing on most races would be worse than its absence.
  let trace = null;
  let measuredTiming = null;
  try {
    [trace, measuredTiming] = await Promise.all([
      getRaceTrace(race.id),
      getMeasuredTiming(race.id),
    ]);
  } catch {
    // A missing trace is the normal case, not a fault.
  }

  /* Measured beats estimated: there is no reason to guess a start time when
     somebody has already ridden the race with a computer running. */
  const timing: RaceTiming = measuredTiming
    ? { ...measuredTiming, measured: true }
    : estimateTiming(
        race.categories,
        race.discipline,
        trace ? trace.distanceM / 1000 : (race.distanceKm ?? null)
      );

  const today = todayISO();
  const date = new Date(`${race.raceDate}T12:00:00Z`);
  const dateEnd = race.raceDateEnd ? new Date(`${race.raceDateEnd}T12:00:00Z`) : null;
  const fed = FEDERATIONS.find((f) => f.slug === race.federationSlug);
  const soon = countdown(race.raceDate, today);
  const isPast = race.raceDate < today;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/calendrier?vue=liste"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 gap-1.5")}
        >
          <ArrowLeft className="size-4" />
          Retour aux courses
        </Link>
        <div className="flex items-center gap-2">
          <PlanButton raceId={race.id} />
          {race.lat && race.lng && (
            <Link
              href={`/calendrier?vue=carte&lat=${race.lat}&lng=${race.lng}&radius=30`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <MapPin className="size-3.5" />
              Situer sur la carte
            </Link>
          )}
        </div>
      </div>

      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <FederationMark slug={race.federationSlug} withLabel />
          {race.isCancelled && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              Annulée
            </span>
          )}
          {soon && !race.isCancelled && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              {soon}
            </span>
          )}
        </div>

        <h1 className="mb-4 text-3xl font-bold tracking-tight">
          {displayRaceName(race.name)}
        </h1>

        <div className="flex flex-col gap-2 text-muted-foreground sm:flex-row sm:gap-6">
          <span className="flex items-center gap-2">
            <Calendar className="size-4 shrink-0 text-primary" />
            <span className="first-letter:uppercase">
              {format(date, "EEEE d MMMM yyyy", { locale: fr })}
            </span>
            {dateEnd && (
              <span className="text-sm">
                → {format(dateEnd, "d MMMM", { locale: fr })}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-primary" />
            <PlaceLabel race={race} />
          </span>
          {race.distanceKm != null && (
            <span className="flex items-center gap-2">
              <Route className="size-4 shrink-0 text-primary" />
              <span className="font-mono tabular-nums">{race.distanceKm} km</span>
            </span>
          )}
        </div>
      </header>

      {race.categories.length > 0 && (
        <div className="mb-8 rounded-xl border border-border bg-surface-1 p-4">
          <SectionHeading icon={Trophy}>Catégories admises</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {race.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs"
              >
                {categoryLabel(cat)}
              </span>
            ))}
          </div>
        </div>
      )}

      {race.isCancelled && (
        <Suspense fallback={null}>
          <CancellationNotice
            raceId={race.id}
            cancelledAt={race.cancelledAt}
          />
        </Suspense>
      )}

      <OrganiserBriefing
        bibPickupTime={race.bibPickupTime}
        bibPickupPlace={race.bibPickupPlace}
        circuitM={race.circuitM}
        lapCount={race.lapCount}
      />

      {race.notes && (
        <p className="mb-8 rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
          {race.notes}
        </p>
      )}

      <div className="flex flex-col gap-8">
        {race.lat != null && race.lng != null && (
          <div className={cn("grid gap-8", !trace && "sm:grid-cols-2")}>
            {!isPast && (
              <Suspense fallback={<Skeleton rows={2} />}>
                <RaceWeatherPanel
                  lat={race.lat}
                  lng={race.lng}
                  date={race.raceDate}
                  timing={timing}
                />
              </Suspense>
            )}
            {/* Only when the course itself is unknown. Reading the relief of
                the surrounding countryside is a stand-in for the profile, and
                keeping it beside an actual trace offers a worse answer next to
                a better one. */}
            {!trace && (
              <Suspense fallback={<Skeleton rows={2} />}>
                <RaceTerrain lat={race.lat} lng={race.lng} />
              </Suspense>
            )}
          </div>
        )}

        {trace && (
          <Suspense fallback={<Skeleton rows={4} />}>
            {/* The wind belongs on the circuit, not only beside it: what a
                rider wants is not "31 km/h nord-ouest" but which side of the
                lap that lands on. Awaited here so the panel arrives coloured
                rather than repainting under the reader. */}
            <CircuitWithWind
              trace={trace}
              raceId={race.id}
              lat={race.lat}
              lng={race.lng}
              date={race.raceDate}
              timing={timing}
            />
          </Suspense>
        )}

        {/* Après la course, la seule question. En premier, donc, avant le
            relief et le peloton qu'on attendait. */}
        {isPast && (
          <Suspense fallback={<Skeleton rows={5} />}>
            <RaceResults raceId={race.id} />
          </Suspense>
        )}

        <Suspense fallback={<Skeleton rows={3} />}>
          <RaceClimbs raceId={race.id} hasTrace={trace !== null} />
        </Suspense>

        <Suspense fallback={<Skeleton rows={2} />}>
          <FieldLevel raceId={race.id} />
        </Suspense>

        {!isPast && (
          <Suspense fallback={<Skeleton rows={4} />}>
            <StartList raceId={race.id} />
          </Suspense>
        )}

        <Suspense fallback={<Skeleton rows={3} />}>
          <SiblingRaces raceId={race.id} />
        </Suspense>

        <Suspense fallback={<Skeleton rows={3} />}>
          <PastEditions raceId={race.id} />
        </Suspense>

        {!isPast && (
          <Suspense fallback={<Skeleton rows={5} />}>
            <RaceCompetitors raceId={race.id} />
          </Suspense>
        )}
      </div>

      {(race.organizer || race.contactEmail || race.contactPhone) && (
        <section className="mt-8">
          <SectionHeading icon={Building2}>Organisation</SectionHeading>
          <div className="flex flex-col gap-1.5 text-sm">
            {race.organizer && <span className="font-medium">{race.organizer}</span>}
            {race.contactEmail && (
              <a
                href={`mailto:${race.contactEmail}`}
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                <Mail className="size-3.5" />
                {race.contactEmail}
              </a>
            )}
            {race.contactPhone && (
              <a
                href={`tel:${race.contactPhone}`}
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                <Phone className="size-3.5" />
                {race.contactPhone}
              </a>
            )}
          </div>
        </section>
      )}

      {race.sourceUrl && (
        <a
          href={race.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-8 gap-2")}
        >
          <ExternalLink className="size-4" />
          Voir sur le site {fed?.name ?? race.federationSlug}
        </a>
      )}
    </div>
  );
}

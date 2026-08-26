import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Calendar, MapPin, Trophy, ExternalLink, Phone, Mail, Building2, Map } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RaceBadge } from "@/components/races/RaceBadge";
import { RaceCompetitors } from "@/components/riders/RaceCompetitors";
import { Suspense } from "react";
import { getRaceById } from "@/lib/db/queries/races";
import { FEDERATIONS } from "@/lib/constants";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { displayRaceName } from "@/lib/race-name";

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
      description: `${displayRaceName(race.name)} — ${race.city} le ${format(new Date(race.raceDate + "T12:00:00Z"), "d MMMM yyyy", { locale: fr })}`,
    };
  } catch {
    return { title: "Course" };
  }
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

  const date = new Date(race.raceDate + "T12:00:00Z");
  const dateEnd = race.raceDateEnd ? new Date(race.raceDateEnd + "T12:00:00Z") : null;
  const fed = FEDERATIONS.find((f) => f.slug === race.federationSlug);

  const formattedDate = format(date, "EEEE d MMMM yyyy", { locale: fr });
  const formattedDateEnd = dateEnd ? format(dateEnd, "EEEE d MMMM yyyy", { locale: fr }) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 w-full">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/courses"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 gap-1.5")}
        >
          <ArrowLeft className="size-4" />
          Retour aux courses
        </Link>
        {race.lat && race.lng && (
          <Link
            href={`/carte?lat=${race.lat}&lng=${race.lng}&radius=30`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Map className="size-3.5" />
            Voir sur la carte
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <RaceBadge type="federation" value={race.federationSlug} />
          <RaceBadge type="discipline" value={race.discipline} />
          {race.level && <RaceBadge type="level" value={race.level} />}
          {race.isCancelled && (
            <Badge variant="destructive">Annulée</Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-4">{displayRaceName(race.name)}</h1>

        <div className="flex flex-col sm:flex-row gap-4 text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <span className="capitalize">{formattedDate}</span>
            {formattedDateEnd && (
              <span>→ {formattedDateEnd}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <span>
              {race.city}
              {race.departmentCode && ` (${race.departmentCode})`}
              {race.departmentName && ` — ${race.departmentName}`}
            </span>
          </div>
        </div>
      </div>

      <Separator className="mb-8" />

      {/* Info grid */}
      <div className="grid sm:grid-cols-2 gap-8 mb-8">
        {/* Categories */}
        {race.categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Catégories</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {race.categories.map((cat) => (
                <RaceBadge key={cat} type="category" value={cat} />
              ))}
            </div>
          </div>
        )}

        {/* Organization */}
        {(race.organizer || race.contactEmail || race.contactPhone) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Organisation</h2>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              {race.organizer && (
                <span className="font-medium">{race.organizer}</span>
              )}
              {race.contactEmail && (
                <a
                  href={`mailto:${race.contactEmail}`}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="size-3.5" />
                  {race.contactEmail}
                </a>
              )}
              {race.contactPhone && (
                <a
                  href={`tel:${race.contactPhone}`}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="size-3.5" />
                  {race.contactPhone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {race.notes && (
        <div className="bg-muted/50 rounded-lg p-4 mb-8">
          <p className="text-sm text-muted-foreground">{race.notes}</p>
        </div>
      )}

      {/* Competitors */}
      <div className="mb-8">
        <Suspense
          fallback={
            <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          }
        >
          <RaceCompetitors raceId={race.id} />
        </Suspense>
      </div>

      {/* Source link */}
      {race.sourceUrl && (
        <a
          href={race.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
        >
          <ExternalLink className="size-4" />
          Voir sur le site {fed?.name ?? race.federationSlug}
        </a>
      )}
    </div>
  );
}

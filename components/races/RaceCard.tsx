import Link from "next/link";
import { MapPin, Calendar, ChevronRight, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RaceBadge, FederationDot } from "./RaceBadge";
import type { Race } from "@/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RaceCardProps {
  race: Race;
  showDistance?: boolean;
}

export function RaceCard({ race, showDistance }: RaceCardProps) {
  const date = new Date(race.raceDate + "T12:00:00Z");
  const dateEnd = race.raceDateEnd
    ? new Date(race.raceDateEnd + "T12:00:00Z")
    : null;

  const formattedDate = format(date, "d MMM yyyy", { locale: fr });
  const formattedDateEnd = dateEnd
    ? format(dateEnd, "d MMM yyyy", { locale: fr })
    : null;

  const dateDisplay = formattedDateEnd
    ? `${formattedDate} → ${formattedDateEnd}`
    : formattedDate;

  return (
    <Link href={`/course/${race.id}`} className="block group">
      <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/40 group-hover:-translate-y-0.5">
        <CardContent className="p-4 flex flex-col gap-3">
          {/* Header: fed dot + discipline + level */}
          <div className="flex items-center gap-2 flex-wrap">
            <FederationDot slug={race.federationSlug} />
            <RaceBadge type="federation" value={race.federationSlug} />
            <RaceBadge type="discipline" value={race.discipline} />
            {race.level && <RaceBadge type="level" value={race.level} />}
            {race.isCancelled && (
              <span className="ml-auto text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                Annulée
              </span>
            )}
          </div>

          {/* Title */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {race.name}
            </h3>
            <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Date + location */}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5 shrink-0" />
              <span className="capitalize">{dateDisplay}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              <span>
                {race.city}
                {race.departmentCode && ` (${race.departmentCode})`}
              </span>
              {showDistance && race.distanceFromUserKm != null && (
                <span className="ml-auto font-medium text-primary">
                  {Math.round(race.distanceFromUserKm)} km
                </span>
              )}
            </div>
          </div>

          {/* Categories */}
          {race.categories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Trophy className="size-3 text-muted-foreground" />
              {race.categories.slice(0, 4).map((cat) => (
                <RaceBadge key={cat} type="category" value={cat} />
              ))}
              {race.categories.length > 4 && (
                <span className="text-xs text-muted-foreground">
                  +{race.categories.length - 4}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

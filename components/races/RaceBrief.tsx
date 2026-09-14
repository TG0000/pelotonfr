import { Megaphone } from "lucide-react";
import { composeBrief } from "@/lib/race-brief";
import { getRaceWeather } from "@/lib/weather";
import { getGround, groundMatters } from "@/lib/ground";
import type { RaceTiming } from "@/lib/race-timing";
import {
  getFieldLevel,
  getPastEditions,
  getRaceClimbs,
  type RaceTrace,
} from "@/lib/db/queries/race-detail";
import type { Race } from "@/types";
import type { RoadReport } from "@/lib/road";
import { windShelter, blindSpots, textureVerdict, type RoadSeen } from "@/lib/road-vision";
import { detectLaps } from "@/lib/trace";
import type { RoadView } from "@/lib/db/queries/road";
import { SectionHeading } from "./StartList";

/**
 * Le brief, en tête de page pour une course à venir.
 *
 * Tout ce qu'il dit est déjà quelque part plus bas ; l'intérêt est de l'avoir
 * recoupé et dans l'ordre. Il s'efface quand moins de deux sources ont parlé :
 * un brief d'une phrase ferait croire qu'on n'en sait pas plus, alors qu'on
 * n'en sait rien.
 */
export async function RaceBrief({
  race,
  trace,
  timing,
  daysLeft,
  road,
  seen,
  views,
}: {
  race: Race;
  trace: RaceTrace | null;
  timing: RaceTiming;
  daysLeft: number;
  road: RoadReport | null;
  seen: RoadSeen | null;
  views: RoadView[];
}) {
  const offRoad = groundMatters(race.discipline);
  const [climbs, field, past, weather, ground] = await Promise.all([
    getRaceClimbs(race.id).catch(() => []),
    getFieldLevel(race.id).catch(() => null),
    getPastEditions(race.id, 1).catch(() => []),
    race.lat != null && race.lng != null && daysLeft <= 10
      ? getRaceWeather(race.lat, race.lng, race.raceDate, timing).catch(() => null)
      : Promise.resolve(null),
    offRoad && race.lat != null && race.lng != null && daysLeft <= 15
      ? getGround(race.lat, race.lng, race.raceDate).catch(() => null)
      : Promise.resolve(null),
  ]);

  const brief = composeBrief({
    daysLeft,
    startHour: timing.startHour,
    timingMeasured: timing.measured,
    entriesEngaged: race.entriesEngaged ?? null,
    entriesCapacity: race.entriesCapacity ?? null,
    entriesCloseAt: race.entriesCloseAt ?? null,
    entrantCount: race.entrantCount ?? null,
    clubGoing: race.clubGoing ?? null,
    trace,
    circuitM: race.circuitM ?? null,
    lapCount: race.lapCount ?? null,
    distanceKm: race.distanceKm ?? null,
    climbs,
    field,
    lastEdition: past[0] ?? null,
    weather,
    ground,
    road,
    seen,
    shelter:
      weather && weather.windVerdict !== "calme" && views.length > 0
        ? windShelter(views, weather.atStart.windDirectionDeg).verdict
        : null,
    grain: textureVerdict(views),
    blind: (() => {
      if (!trace || views.length === 0) return [];
      const lap = detectLaps(trace.points).lap ?? trace.points;
      return blindSpots(views.filter((v) => v.reading), lap[lap.length - 1][3]).map(
        (b) => `${(b.fromM / 1000).toFixed(1).replace(".", ",")} → ${(b.toM / 1000).toFixed(1).replace(".", ",")}`
      );
    })(),
    now: new Date(),
  });

  if (brief.sources < 2) return null;

  return (
    <section className="mb-8">
      <SectionHeading icon={Megaphone}>
        Le brief
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {daysLeft === 0 ? "ce matin" : daysLeft === 1 ? "pour demain" : `à J-${daysLeft}`}
        </span>
      </SectionHeading>
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <ul className="flex flex-col gap-2 text-sm leading-relaxed">
          {brief.lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

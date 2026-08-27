import { CloudRain, Thermometer, Wind } from "lucide-react";
import { getRaceWeather, type RaceWeather as Forecast } from "@/lib/weather";
import { formatHour, type RaceTiming } from "@/lib/race-timing";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * What the day will be like, across the window the race occupies.
 *
 * Wind leads, because on the exposed circuits these races are run on it decides
 * the outcome more often than the climbs do. The strongest gust of the window
 * is given its own line: a race that rolls off in still air and finishes into a
 * headwind is a different race, and the mean at any one moment hides that.
 */

const VERDICT: Record<Forecast["windVerdict"], { sentence: string; tone: string }> = {
  calme: {
    sentence: "Vent faible : le peloton l'absorbera.",
    tone: "text-muted-foreground",
  },
  sensible: {
    sentence: "Vent sensible sur les portions exposées, sans plus.",
    tone: "text-muted-foreground",
  },
  fort: {
    sentence: "Vent fort : ça va étirer dans les secteurs découverts.",
    tone: "text-accent",
  },
  décisif: {
    sentence: "Vent décisif : à ce niveau-là, il fera la course.",
    tone: "text-destructive",
  },
};

/** An arrow pointing where the wind is going, not where it comes from. */
function WindArrow({ fromDegrees }: { fromDegrees: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      style={{ transform: `rotate(${fromDegrees + 180}deg)` }}
      aria-hidden
    >
      <path
        d="M12 3 L12 21 M12 3 L7 9 M12 3 L17 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Moment({
  label,
  sample,
}: {
  label: string;
  sample: Forecast["atStart"];
}) {
  return (
    <div className="flex items-center gap-2.5">
      <WindArrow fromDegrees={sample.windDirectionDeg} />
      <div className="min-w-0">
        {/* The window is already in the heading; repeating a rounded hour
            beside it only invited the reader to notice they disagree. */}
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-lg font-medium tabular-nums leading-tight">
          {sample.windKmh}
          <span className="ml-0.5 text-xs font-normal">km/h</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {sample.windCardinal}
          </span>
        </div>
      </div>
    </div>
  );
}

export async function RaceWeatherPanel({
  lat,
  lng,
  date,
  timing,
}: {
  lat: number;
  lng: number;
  date: string;
  timing: RaceTiming;
}) {
  const weather = await getRaceWeather(lat, lng, date, timing);
  // Out of forecast range is the normal case for most of the calendar, and
  // saying so would be noise on every race more than a fortnight away.
  if (!weather) return null;

  const verdict = VERDICT[weather.windVerdict];
  const shifted =
    weather.atStart.windCardinal !== weather.atFinish.windCardinal ||
    Math.abs(weather.atStart.windKmh - weather.atFinish.windKmh) >= 8;

  return (
    <section>
      <SectionHeading icon={Wind}>
        Conditions annoncées
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {formatHour(weather.startHour)} → {formatHour(weather.endHour)}
        </span>
      </SectionHeading>

      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className={cn("flex flex-wrap gap-x-8 gap-y-3", verdict.tone)}>
          <Moment label="Départ" sample={weather.atStart} />
          {shifted && <Moment label="Arrivée" sample={weather.atFinish} />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
          <span className="flex items-center gap-1.5">
            <Wind className="size-4 text-muted-foreground" />
            <span className="font-mono tabular-nums">{weather.peakGustKmh}</span>
            <span className="text-xs text-muted-foreground">rafale max</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CloudRain className="size-4 text-muted-foreground" />
            <span className="font-mono tabular-nums">
              {weather.peakRainProbability}%
            </span>
            <span className="text-xs text-muted-foreground">de pluie</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Thermometer className="size-4 text-muted-foreground" />
            <span className="font-mono tabular-nums">
              {weather.atStart.temperatureC}°
            </span>
            {weather.atStart.feelsLikeC !== weather.atStart.temperatureC && (
              <span className="text-xs text-muted-foreground">
                ressenti {weather.atStart.feelsLikeC}°
              </span>
            )}
          </span>
        </div>

        <p className={cn("mt-3 text-sm", verdict.tone)}>{verdict.sentence}</p>

        <p className="mt-2 text-xs text-muted-foreground/70">
          {weather.timingMeasured
            ? "Horaire relevé sur une édition précédente."
            : "Horaire estimé d'après la catégorie et la distance."}
        </p>
      </div>
    </section>
  );
}

import { CloudRain, Thermometer, Wind } from "lucide-react";
import { getRaceWeather, type RaceWeather as Forecast } from "@/lib/weather";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * What the day will be like, read for a bike race.
 *
 * Wind leads, because on the exposed circuits these races are run on it decides
 * the outcome more often than the climbs do. Temperature comes last: it changes
 * what you wear, not who wins.
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

export async function RaceWeatherPanel({
  lat,
  lng,
  date,
}: {
  lat: number;
  lng: number;
  date: string;
}) {
  const weather = await getRaceWeather(lat, lng, date);
  // Out of forecast range is the normal case for most of the calendar, and
  // saying so would be noise on every race more than a fortnight away.
  if (!weather) return null;

  const verdict = VERDICT[weather.windVerdict];

  return (
    <section>
      <SectionHeading icon={Wind}>
        Conditions annoncées
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          à {weather.hour} h
        </span>
      </SectionHeading>

      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-start gap-4">
          <div className={cn("flex items-center gap-2", verdict.tone)}>
            <WindArrow fromDegrees={weather.windDirectionDeg} />
            <div>
              <div className="font-mono text-2xl font-medium tabular-nums leading-none">
                {weather.windKmh}
                <span className="ml-1 text-sm font-normal">km/h</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                de {weather.windCardinal} · rafales {weather.gustKmh}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Thermometer className="size-4 text-muted-foreground" />
              <span className="font-mono tabular-nums">{weather.temperatureC}°</span>
              {weather.feelsLikeC !== weather.temperatureC && (
                <span className="text-xs text-muted-foreground">
                  ressenti {weather.feelsLikeC}°
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <CloudRain className="size-4 text-muted-foreground" />
              <span className="font-mono tabular-nums">
                {weather.precipitationProbability}%
              </span>
            </span>
          </div>
        </div>

        <p className={cn("mt-3 border-t border-border pt-3 text-sm", verdict.tone)}>
          {verdict.sentence}
        </p>
      </div>
    </section>
  );
}

/**
 * Race-day weather.
 *
 * Open-Meteo, which needs no key and forecasts sixteen days out — long enough
 * to cover the window in which a rider actually decides whether to enter.
 *
 * What a racer needs from a forecast is not the same as what a walker needs.
 * Temperature matters least; wind matters most, because a crosswind on an
 * exposed circuit decides the race before the finish does. So gusts are carried
 * separately from mean wind, and the direction is named in the compass points
 * a rider would use rather than left in degrees.
 */

const API = "https://api.open-meteo.com/v1/forecast";

export interface WeatherSample {
  /** Local hour of the sample. */
  hour: number;
  temperatureC: number;
  feelsLikeC: number;
  precipitationProbability: number;
  windKmh: number;
  gustKmh: number;
  windDirectionDeg: number;
  windCardinal: string;
}

export interface RaceWeather {
  date: string;
  /** The window the race is expected to occupy. */
  startHour: number;
  endHour: number;
  /** Conditions at the start, and at the finish. */
  atStart: WeatherSample;
  atFinish: WeatherSample;
  /** The worst gust anywhere in the window — what actually breaks a bunch. */
  peakGustKmh: number;
  /** The highest chance of rain across the window. */
  peakRainProbability: number;
  /** Plain-French reading of what the wind will do to a bunch. */
  windVerdict: "calme" | "sensible" | "fort" | "décisif";
  /** Whether the window came from a recorded ride or from an estimate. */
  timingMeasured: boolean;
}

const CARDINALS = [
  "nord", "nord-est", "est", "sud-est",
  "sud", "sud-ouest", "ouest", "nord-ouest",
];

export function cardinal(degrees: number): string {
  return CARDINALS[Math.round(degrees / 45) % 8];
}

/**
 * How much the wind will matter.
 *
 * The thresholds are a rider's, not a meteorologist's: below 15 km/h the bunch
 * absorbs it, by 30 it strings out on the exposed sections, and past 45 with
 * gusts it decides who is still there at the finish.
 */
function verdictFor(windKmh: number, gustKmh: number): RaceWeather["windVerdict"] {
  const effective = Math.max(windKmh, gustKmh * 0.75);
  if (effective < 15) return "calme";
  if (effective < 30) return "sensible";
  if (effective < 45) return "fort";
  return "décisif";
}

interface HourlyResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
  };
}

/**
 * The forecast across the window the race actually occupies.
 *
 * A single reading at a fixed hour was already better than a daily average, but
 * it still missed the thing that matters: a race that rolls off in still air at
 * two and finishes into a headwind at four is a different race, and the number
 * that decides it is the strongest gust anywhere in between — not the mean at
 * any one moment.
 */
export async function getRaceWeather(
  lat: number,
  lng: number,
  date: string,
  timing: { startHour: number; durationMinutes: number; measured: boolean }
): Promise<RaceWeather | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly:
      "temperature_2m,apparent_temperature,precipitation_probability," +
      "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
    start_date: date,
    end_date: date,
    timezone: "Europe/Paris",
  });

  try {
    const res = await fetch(`${API}?${params}`, {
      // A forecast that moves every few minutes is noise; an hour is plenty,
      // and it keeps a popular race from hammering a free service.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as HourlyResponse;
    const h = data.hourly;
    if (!h?.time?.length) return null;

    const sampleAt = (hour: number): WeatherSample | null => {
      const clamped = Math.min(23, Math.max(0, Math.round(hour)));
      const i = h.time.findIndex((t) => Number(t.slice(11, 13)) === clamped);
      if (i < 0) return null;
      return {
        hour: clamped,
        temperatureC: Math.round(h.temperature_2m[i]),
        feelsLikeC: Math.round(h.apparent_temperature[i]),
        precipitationProbability: Math.round(h.precipitation_probability[i]),
        windKmh: Math.round(h.wind_speed_10m[i]),
        gustKmh: Math.round(h.wind_gusts_10m[i]),
        windDirectionDeg: h.wind_direction_10m[i],
        windCardinal: cardinal(h.wind_direction_10m[i]),
      };
    };

    const endHour = timing.startHour + timing.durationMinutes / 60;
    const atStart = sampleAt(timing.startHour);
    const atFinish = sampleAt(endHour) ?? atStart;
    if (!atStart || !atFinish) return null;

    // Everything the race is actually exposed to, not just its endpoints.
    let peakGustKmh = 0;
    let peakRainProbability = 0;
    let peakWind = 0;
    for (let i = 0; i < h.time.length; i++) {
      const hour = Number(h.time[i].slice(11, 13));
      if (hour < Math.floor(timing.startHour) || hour > Math.ceil(endHour)) continue;
      peakGustKmh = Math.max(peakGustKmh, Math.round(h.wind_gusts_10m[i]));
      peakWind = Math.max(peakWind, Math.round(h.wind_speed_10m[i]));
      peakRainProbability = Math.max(
        peakRainProbability,
        Math.round(h.precipitation_probability[i])
      );
    }

    return {
      date,
      startHour: timing.startHour,
      endHour,
      atStart,
      atFinish,
      peakGustKmh,
      peakRainProbability,
      windVerdict: verdictFor(peakWind, peakGustKmh),
      timingMeasured: timing.measured,
    };
  } catch {
    return null;
  }
}

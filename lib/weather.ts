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

/** The hours an amateur race is actually run. */
const RACE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

export interface RaceWeather {
  date: string;
  /** The hour the sample is taken from, in local time. */
  hour: number;
  temperatureC: number;
  feelsLikeC: number;
  precipitationProbability: number;
  windKmh: number;
  gustKmh: number;
  windDirectionDeg: number;
  windCardinal: string;
  /** Plain-French reading of what the wind will do to a bunch. */
  windVerdict: "calme" | "sensible" | "fort" | "décisif";
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
 * The forecast for one race, or null when it is out of range or unlocated.
 *
 * Sampled at the middle of the racing afternoon rather than averaged across the
 * day: a rider starting at two o'clock is not helped by a figure that includes
 * dawn.
 */
export async function getRaceWeather(
  lat: number,
  lng: number,
  date: string
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

    // Prefer mid-afternoon, fall back to whatever the day offers.
    let index = h.time.findIndex((t) => Number(t.slice(11, 13)) === 14);
    if (index < 0) {
      index = h.time.findIndex((t) =>
        RACE_HOURS.includes(Number(t.slice(11, 13)))
      );
    }
    if (index < 0) index = Math.min(12, h.time.length - 1);

    const windKmh = Math.round(h.wind_speed_10m[index]);
    const gustKmh = Math.round(h.wind_gusts_10m[index]);
    const direction = h.wind_direction_10m[index];

    return {
      date,
      hour: Number(h.time[index].slice(11, 13)),
      temperatureC: Math.round(h.temperature_2m[index]),
      feelsLikeC: Math.round(h.apparent_temperature[index]),
      precipitationProbability: Math.round(h.precipitation_probability[index]),
      windKmh,
      gustKmh,
      windDirectionDeg: direction,
      windCardinal: cardinal(direction),
      windVerdict: verdictFor(windKmh, gustKmh),
    };
  } catch {
    return null;
  }
}

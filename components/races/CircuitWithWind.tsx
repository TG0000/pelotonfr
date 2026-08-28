import { getRaceWeather } from "@/lib/weather";
import type { RaceTiming } from "@/lib/race-timing";
import type { RaceTrace } from "@/lib/db/queries/race-detail";
import { RaceCircuit } from "./RaceCircuit";

/**
 * The circuit, knowing which way the wind will be blowing.
 *
 * Two panels on this page were reading the same forecast and saying different
 * halves of it: the weather box says "31 km/h from the north-west", which is
 * a fact, and the circuit says nothing, which is where the fact matters. A
 * rider does not ride a compass bearing, they ride a lap — and the question is
 * which part of it they will be pushing into.
 *
 * The forecast reaches sixteen days. Past that the circuit still draws, in
 * gradient, and the wind view says plainly that there is nothing to show yet.
 */
export async function CircuitWithWind({
  trace,
  raceId,
  lat,
  lng,
  date,
  timing,
}: {
  trace: RaceTrace;
  raceId: string;
  lat: number | null;
  lng: number | null;
  date: string;
  timing: RaceTiming;
}) {
  let windFromDeg: number | null = null;
  let windKmh: number | null = null;

  if (lat != null && lng != null) {
    try {
      const weather = await getRaceWeather(lat, lng, date, timing);
      if (weather?.atStart) {
        windFromDeg = weather.atStart.windDirectionDeg;
        windKmh = weather.atStart.windKmh;
      }
    } catch {
      // A forecast that will not load must not take the circuit down with it.
    }
  }

  return (
    <RaceCircuit
      trace={trace}
      raceId={raceId}
      windFromDeg={windFromDeg}
      windKmh={windKmh}
    />
  );
}

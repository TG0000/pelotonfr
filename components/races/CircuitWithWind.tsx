import { getRaceWeather } from "@/lib/weather";
import type { RaceTiming } from "@/lib/race-timing";
import type { RaceTrace } from "@/lib/db/queries/race-detail";
import { RaceCircuit } from "./RaceCircuit";
import type { RoadView } from "@/lib/db/queries/road";
import type { RoadPhotoMarker } from "./CircuitView3D";
import { getStreetViewCoverage } from "@/lib/db/queries/race-detail";

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
  views = [],
}: {
  trace: RaceTrace;
  raceId: string;
  lat: number | null;
  lng: number | null;
  date: string;
  timing: RaceTiming;
  views?: RoadView[];
}) {
  let windFromDeg: number | null = null;
  let windKmh: number | null = null;
  const coverage = await getStreetViewCoverage(raceId).catch(() => []);

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

  /* Les photos lues deviennent des points sur la carte, avec le pire danger
     vu à cet endroit. Les côtés sont remis dans le sens de la course. */
  const photos: RoadPhotoMarker[] = views
    .filter((v) => v.reading && v.alongM != null && v.reading.surface !== "inconnu")
    .map((v) => {
      const r = v.reading!;
      const left = v.orientation === "arrière" ? r.coverRight : r.coverLeft;
      const right = v.orientation === "arrière" ? r.coverLeft : r.coverRight;
      const sides = left && right ? ` · G ${left} / D ${right}` : "";
      const hazards = (r.hazards ?? []).map((h) => `${h.kind}${h.note ? ` (${h.note})` : ""}`);
      const severity = Math.max(0, ...(r.hazards ?? []).map((h) => h.severity)) as 0 | 1 | 2 | 3;
      return {
        id: v.pictureId,
        lng: v.lng,
        lat: v.lat,
        alongM: v.alongM!,
        imageUrl: v.hasCrop ? `/api/road-view/${v.pictureId}.jpg` : v.url,
        label: `${r.surface}, ${r.condition}${sides}`,
        note: r.note,
        severity,
        hazards,
      };
    });

  return (
    <RaceCircuit
      trace={trace}
      raceId={raceId}
      windFromDeg={windFromDeg}
      windKmh={windKmh}
      photos={photos}
      coverage={coverage}
    />
  );
}

import { decodePolyline, distancesAlong, metresBetween } from "@/lib/polyline";

/**
 * Finding the circuit a race is run on.
 *
 * An amateur race is laps of a village loop, and riders have almost always
 * traced that loop into Strava as a segment — it is the road they train on.
 * The explorer hands back the full shape of every segment in a box, so the
 * circuit is usually there among them; the problem is recognising it.
 *
 * A circuit is a closed loop: it finishes where it starts. That single property
 * separates it from the climbs, descents and sprints that make up the rest of
 * what a sector contains, and it can be checked without a single extra request.
 */

export interface CircuitCandidate {
  segmentId: number;
  name: string;
  /** [lat, lng] along the loop. */
  points: Array<[number, number]>;
  lengthM: number;
  /** How far the finish sits from the start. */
  closureM: number;
  /** Distance from the race's own coordinates to the nearest point of the loop. */
  proximityM: number;
  /** Whether the rider who traced it called it a race circuit. */
  named: boolean;
  score: number;
}

/** The shape of what the explorer returns, as lib/strava/client exposes it. */
interface ExploreSegment {
  id: number;
  name: string;
  points: string | null;
}

/** A lap shorter than this is a car park; longer is a point-to-point road race. */
const MIN_LAP_M = 1_500;
const MAX_LAP_M = 30_000;

/**
 * How far the two ends may sit apart and still count as closed.
 *
 * Measured rather than guessed: the loops that turn out to be actual race
 * circuits close to within a handful of metres — 1 m for the Championnat
 * Nièvre, 5 m for the GP de Sablé, 34 m at worst. A point-to-point time trial
 * drawn in the same sector missed by 769 m. Tight is right, with a small
 * allowance in proportion to the lap for a long one traced by hand.
 */
function closureToleranceFor(lengthM: number): number {
  return Math.max(60, lengthM * 0.01);
}

/**
 * Words riders use when they trace a race circuit into Strava.
 *
 * This is the strongest signal of all, and it costs nothing: someone has
 * already labelled the loop "Circuit Course Mayenne" or "Championnat Nièvre
 * 2026". Geometry says it is a loop; the name says it is *the* loop.
 */
const RACE_WORDS = [
  "circuit", "course", "criterium", "critérium", "championnat", "chpt",
  "grand prix", "gp ", "epreuve", "épreuve", "prix de", "tour de", "boucle",
];

function nameSuggestsRace(name: string): boolean {
  const lower = name.toLowerCase();
  return RACE_WORDS.some((w) => lower.includes(w));
}

/** Beyond this the loop is somewhere else entirely, not this race's circuit. */
const MAX_PROXIMITY_M = 6_000;

export function findCircuits(
  segments: ExploreSegment[],
  race: { lat: number; lng: number; expectedLapM?: number | null }
): CircuitCandidate[] {
  const candidates: CircuitCandidate[] = [];

  for (const segment of segments) {
    if (!segment.points) continue;

    const points = decodePolyline(segment.points);
    if (points.length < 20) continue;

    const distances = distancesAlong(points);
    const lengthM = distances[distances.length - 1];
    if (lengthM < MIN_LAP_M || lengthM > MAX_LAP_M) continue;

    const closureM = metresBetween(points[0], points[points.length - 1]);
    if (closureM > closureToleranceFor(lengthM)) continue;

    // A loop that closes but sits ten kilometres away belongs to another race.
    let proximityM = Infinity;
    for (const p of points) {
      proximityM = Math.min(proximityM, metresBetween(p, [race.lat, race.lng]));
    }
    if (proximityM > MAX_PROXIMITY_M) continue;

    /* Closing tightly, passing close to the published start, named like a
       race, and — when the organiser tells us how long a lap is — matching
       that length. */
    const named = nameSuggestsRace(segment.name);
    let score = named ? 6 : 0;
    score += Math.max(0, 1 - closureM / closureToleranceFor(lengthM)) * 3;
    score += Math.max(0, 1 - proximityM / MAX_PROXIMITY_M) * 4;
    if (race.expectedLapM) {
      const ratio = lengthM / race.expectedLapM;
      score += Math.max(0, 1 - Math.abs(1 - ratio)) * 5;
    } else {
      // Without a stated lap length, a longer loop is more likely to be the
      // circuit than a short one, which tends to be a single climb drawn as
      // an out-and-back.
      score += Math.min(1, lengthM / 12_000) * 2;
    }

    candidates.push({
      segmentId: segment.id,
      name: segment.name,
      points,
      lengthM,
      closureM,
      proximityM,
      named,
      score,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Heights along a track, from the public elevation model.
 *
 * Strava's explorer gives the shape but not the ground, so the profile is read
 * separately. A hundred points is the service's limit per request and plenty
 * for a circuit: it puts a sample every eighty metres on an eight-kilometre lap.
 */
export async function elevationsFor(
  points: Array<[number, number]>,
  samples = 100
): Promise<number[] | null> {
  const step = Math.max(1, Math.floor(points.length / samples));
  const sampled = points.filter((_, i) => i % step === 0).slice(0, samples);
  if (sampled.length < 2) return null;

  const lats = sampled.map((p) => p[0].toFixed(5)).join(",");
  const lngs = sampled.map((p) => p[1].toFixed(5)).join(",");

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
      { next: { revalidate: 86_400 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { elevation?: number[] };
    return data.elevation ?? null;
  } catch {
    return null;
  }
}

/** Spreads sampled heights back across every point of the track. */
export function interpolateElevations(
  pointCount: number,
  sampled: number[]
): number[] {
  if (sampled.length === 0) return new Array(pointCount).fill(0);

  const out: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    const position = (i / Math.max(1, pointCount - 1)) * (sampled.length - 1);
    const low = Math.floor(position);
    const high = Math.min(sampled.length - 1, low + 1);
    const t = position - low;
    out.push(sampled[low] * (1 - t) + sampled[high] * t);
  }
  return out;
}

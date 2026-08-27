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

/**
 * How far the middle of a loop may sit from the commune the race is held in.
 *
 * A race circuit starts and finishes in the village whose name it carries. The
 * scoring used to weigh proximity against a good name and let a name win: for
 * Argentan it chose "circuit Sarceaux", a real circuit in the neighbouring
 * commune, centred three and a half kilometres away. A circuit belonging to
 * somebody else's race is worse than no circuit, because the reader has no way
 * of telling.
 */
const MAX_CENTRE_M = 2_500;

/** Strips accents and punctuation so "Bagnoles-de-l'Orne" can meet "bagnoles". */
function placeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
}

export function findCircuits(
  segments: ExploreSegment[],
  race: {
    lat: number;
    lng: number;
    expectedLapM?: number | null;
    /** The commune, when we know it: a circuit is named after where it is. */
    city?: string | null;
  }
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

    // Passing near the village is not the same as being its circuit: a loop in
    // the next commune brushes past too. The middle of the loop is what says
    // whose circuit it is.
    const centreM = metresBetween(
      [
        (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2,
        (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2,
      ],
      [race.lat, race.lng]
    );
    if (centreM > MAX_CENTRE_M) continue;

    /* Closing tightly, passing close to the published start, named like a
       race, and — when the organiser tells us how long a lap is — matching
       that length. */
    const named = nameSuggestsRace(segment.name);
    let score = named ? 6 : 0;

    /* A circuit carries the name of the place it is in. When the segment names
       the race's own commune that is the strongest signal there is; when it
       names a *different* commune, the name that looked like evidence is
       evidence against. */
    if (race.city) {
      const town = new Set(placeTokens(race.city));
      const words = placeTokens(segment.name);
      if (words.some((w) => town.has(w))) score += 5;
      else if (named) score -= 2;
    }
    score += Math.max(0, 1 - closureM / closureToleranceFor(lengthM)) * 3;
    score += Math.max(0, 1 - proximityM / MAX_PROXIMITY_M) * 4;
    score += Math.max(0, 1 - centreM / MAX_CENTRE_M) * 4;
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
 * separately. A hundred coordinates is the service's limit *per request*, which
 * was taken for the limit full stop — so an eight-kilometre lap was profiled
 * every eighty metres, and the climb that decides the race became a smooth ramp
 * with its steep pitch averaged away.
 *
 * The limit is per request, and the service is free and unmetered, so the track
 * is read in as many requests as it takes to sample it every fifteen metres or
 * so. Requests go one after another rather than at once: this is somebody
 * else's server and we are asking a favour.
 */
const ELEVATION_BATCH = 100;
/**
 * How closely the ground is read, in metres along the track.
 *
 * Twenty rather than fifteen: the service's allowance is weighted by how many
 * coordinates a request carries, so the spacing is what decides how long a
 * circuit takes to profile. Twenty metres is four times finer than the eighty
 * this used to manage and costs a quarter less waiting.
 */
const ELEVATION_SPACING_M = 20;
/** Above this a track is sampled more coarsely rather than not at all. */
const MAX_ELEVATION_SAMPLES = 1_200;

/**
 * One request, with the patience the service asks for.
 *
 * Open-Meteo answers 429 with "try again in one minute" when a burst crosses
 * its minutely allowance — which reading fifty circuits back to back does
 * comfortably. Treating that as a failure was worse than slow: the profile came
 * back flat and nothing said why. It is a queue, not a refusal, so it is waited
 * out.
 */
async function fetchElevations(
  batch: Array<[number, number]>,
  attempt = 0
): Promise<number[] | null> {
  const lats = batch.map((p) => p[0].toFixed(5)).join(",");
  const lngs = batch.map((p) => p[1].toFixed(5)).join(",");
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
      { next: { revalidate: 86_400 } }
    );

    // Their allowance is weighted by the number of coordinates asked for, so a
    // hundred of them is most of a minute's budget and the wait they name is
    // the wait they mean. Taken literally, with a little room.
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 65_000));
      return fetchElevations(batch, attempt + 1);
    }
    if (!res.ok) return null;

    const data = (await res.json()) as { elevation?: number[] };
    return data.elevation ?? null;
  } catch {
    return null;
  }
}

export async function elevationsFor(
  points: Array<[number, number]>,
  lengthM?: number
): Promise<number[] | null> {
  if (points.length < 2) return null;

  const wanted = lengthM
    ? Math.ceil(lengthM / ELEVATION_SPACING_M)
    : points.length;
  const samples = Math.min(MAX_ELEVATION_SAMPLES, Math.max(2, wanted));

  // Evenly spaced along the track, endpoints included, so the profile starts
  // and finishes where the circuit does.
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) {
    const at = Math.round((i / (samples - 1)) * (points.length - 1));
    sampled.push(points[at]);
  }

  const heights: number[] = [];
  for (let i = 0; i < sampled.length; i += ELEVATION_BATCH) {
    const batch = await fetchElevations(sampled.slice(i, i + ELEVATION_BATCH));
    // A track half read is a profile that lies about where the climbs are.
    if (!batch) return heights.length >= 2 ? heights : null;
    heights.push(...batch);
    if (i + ELEVATION_BATCH < sampled.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return heights.length >= 2 ? heights : null;
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

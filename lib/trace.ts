/**
 * Reducing a ride to a course.
 *
 * A Strava stream is tens of thousands of points; no map draws them all and no
 * profile needs them. What a rider wants to see is the shape of the circuit and
 * where it climbs, which survives aggressive simplification — provided the
 * simplification keeps the corners rather than sampling every nth point, which
 * would round off exactly the hairpins that make a circuit recognisable.
 */

export interface TracePoint {
  /** [lng, lat] — the order GeoJSON and MapLibre both expect. */
  0: number;
  1: number;
  /** Metres above sea level. */
  2: number;
  /** Metres from the start. */
  3: number;
}

export interface TraceSummary {
  points: Array<[number, number, number, number]>;
  distanceM: number;
  elevationGainM: number;
  minElevationM: number;
  maxElevationM: number;
  bounds: { west: number; south: number; east: number; north: number };
}

/**
 * Ramer–Douglas–Peucker on the ground track.
 *
 * Keeps the points that carry the shape and discards the ones on a straight,
 * so a 12 000-point ride becomes a few hundred without losing a bend.
 */
function simplify(
  points: Array<[number, number, number, number]>,
  toleranceDeg: number
): Array<[number, number, number, number]> {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;

    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denom = Math.hypot(dx, dy) || 1e-12;

    for (let i = first + 1; i < last; i++) {
      const [x0, y0] = points[i];
      // Perpendicular distance from the point to the chord.
      const dist = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom;
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (index !== -1 && maxDist > toleranceDeg) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Climbing, counted the way a cyclist counts it.
 *
 * Barometric noise adds a metre here and there on flat ground, and summing
 * every positive step turns a pancake into a mountain stage. Only rises above
 * a threshold count.
 */
function elevationGain(altitudes: number[]): number {
  const MIN_STEP_M = 2;
  let gain = 0;
  let reference = altitudes[0];

  for (const a of altitudes) {
    if (a > reference + MIN_STEP_M) {
      gain += a - reference;
      reference = a;
    } else if (a < reference) {
      reference = a;
    }
  }
  return gain;
}

export function summariseTrace(
  latlng: Array<[number, number]>,
  altitude: number[],
  distance: number[]
): TraceSummary | null {
  if (latlng.length < 2) return null;

  const raw: Array<[number, number, number, number]> = latlng.map((p, i) => [
    p[1], // lng
    p[0], // lat
    altitude[i] ?? altitude[altitude.length - 1] ?? 0,
    distance[i] ?? 0,
  ]);

  // About 8 m at these latitudes: fine enough that a village circuit keeps its
  // corners, coarse enough to leave a few hundred points.
  const simplified = simplify(raw, 0.00008);

  const alts = raw.map((p) => p[2]).filter((a) => Number.isFinite(a));
  const distances = raw.map((p) => p[3]).filter((d) => Number.isFinite(d));

  const lngs = simplified.map((p) => p[0]);
  const lats = simplified.map((p) => p[1]);

  return {
    points: simplified,
    distanceM: distances.length ? distances[distances.length - 1] : 0,
    elevationGainM: alts.length ? Math.round(elevationGain(alts)) : 0,
    minElevationM: alts.length ? Math.round(Math.min(...alts)) : 0,
    maxElevationM: alts.length ? Math.round(Math.max(...alts)) : 0,
    bounds: {
      west: Math.min(...lngs),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      north: Math.max(...lats),
    },
  };
}

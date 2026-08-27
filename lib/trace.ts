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
 * Ramer–Douglas–Peucker over the ground track *and* the profile.
 *
 * Keeps the points that carry the shape and discards the ones on a straight,
 * so a 12 000-point ride becomes a few hundred without losing a bend.
 *
 * The measure used to be the ground track alone, which is right for a map and
 * wrong for a profile: a kilometre of straight road is one chord however much
 * it climbs, so every rise along it collapsed to a single ramp. On a lapped
 * race the damage compounded — a 72 km ride kept 500 points, so one 6.5 km lap
 * was drawn from fifty, a point every 130 metres, and the profile read as a
 * child's drawing of the course rather than the course.
 *
 * So a point is far from the chord if it is far *either* on the ground or in
 * height. The two are in different units — degrees and metres — so height is
 * converted at the latitude of the ride: roughly 111 km to the degree, and a
 * metre of climb matters about as much as ten metres of ground, which is the
 * ratio at which a profile stops looking angular.
 */
const METRES_PER_DEGREE = 111_320;
/**
 * How much a metre of height counts against a metre of ground.
 *
 * Fifteen, chosen against a real 86 km ride: it keeps a point every twenty-odd
 * metres where the ride itself recorded one every twelve, and spends those
 * points on the pitches rather than on the bends.
 */
const HEIGHT_WEIGHT = 15;

/**
 * The most points a stored trace may carry.
 *
 * A profile a reader can trust costs bytes the reader has to download, and a
 * long cyclosportive would otherwise arrive as half a megabyte of JSON. Above
 * this the track is simplified again, more coarsely, rather than truncated —
 * losing the far half of a course is worse than drawing all of it slightly
 * plainer.
 */
const MAX_POINTS = 5_000;

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

    const [x1, y1, z1] = points[first];
    const [x2, y2, z2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denom = Math.hypot(dx, dy) || 1e-12;
    const dz = z2 - z1;

    for (let i = first + 1; i < last; i++) {
      const [x0, y0, z0] = points[i];
      // Perpendicular distance from the point to the chord, on the ground.
      const ground =
        Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom;

      // And how far the height strays from the chord's own straight line,
      // measured where the point falls along it.
      const along =
        denom > 0
          ? ((x0 - x1) * dx + (y0 - y1) * dy) / (denom * denom)
          : 0;
      const expected = z1 + dz * Math.min(1, Math.max(0, along));
      const height =
        (Math.abs(z0 - expected) * HEIGHT_WEIGHT) / METRES_PER_DEGREE;

      const dist = Math.max(ground, height);
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

  // About a metre at these latitudes. Eight metres was chosen to keep a village
  // circuit's corners, which it did — but a circuit is not only read as a shape
  // on a map, it is read as a profile, and a profile drawn every 130 metres is
  // a rumour. On a lapped race the loss compounded: a 72 km ride kept 500
  // points, so one 6.5 km lap was drawn from fifty.
  let simplified = simplify(raw, 0.00001);
  for (
    let tolerance = 0.00002;
    simplified.length > MAX_POINTS && tolerance < 0.001;
    tolerance *= 2
  ) {
    simplified = simplify(raw, tolerance);
  }

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

export interface LapAnalysis {
  /** Where each lap starts, as indices into the track. */
  boundaries: number[];
  lapCount: number;
  lapDistanceM: number;
  /** One representative lap, or null when the course is not laps of a circuit. */
  lap: Array<[number, number, number, number]> | null;
}

/**
 * Finds the laps in a recorded course.
 *
 * An amateur road race is a village circuit ridden a dozen times, so a profile
 * of the whole ride is the same hill drawn fourteen times — which tells a rider
 * nothing they could not read from one, and hides the detail that matters by
 * squeezing it. What they want to see is a lap.
 *
 * A lap is detected by the track coming back to where it started. The threshold
 * has to be generous in space and strict in distance travelled: a circuit passes
 * its own start line within a few tens of metres, but a rider weaving through a
 * village also passes within a few tens of metres of a point they crossed
 * moments ago, and only the first is a lap.
 */
export function detectLaps(
  points: Array<[number, number, number, number]>
): LapAnalysis {
  const empty: LapAnalysis = {
    boundaries: [],
    lapCount: 1,
    lapDistanceM: points.length ? points[points.length - 1][3] : 0,
    lap: null,
  };
  if (points.length < 40) return empty;

  const start: [number, number] = [points[0][1], points[0][0]];
  const totalM = points[points.length - 1][3];

  const RETURN_TOLERANCE_M = 120;
  /** Below this a "lap" is the rider circling the start village, not a circuit. */
  const MIN_LAP_M = 1_800;

  const boundaries = [0];
  let searching = true;

  for (let i = 1; i < points.length; i++) {
    const travelled = points[i][3] - points[boundaries[boundaries.length - 1]][3];
    if (travelled < MIN_LAP_M) {
      searching = true;
      continue;
    }

    const away = metresFrom(start, [points[i][1], points[i][0]]);
    if (searching && away < RETURN_TOLERANCE_M) {
      boundaries.push(i);
      // Do not mark again until the track has left the start behind, or one
      // pass would register as several.
      searching = false;
    }
  }

  if (boundaries.length < 3) return empty;

  const lapDistances: number[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    lapDistances.push(points[boundaries[i]][3] - points[boundaries[i - 1]][3]);
  }

  // Laps of a circuit are all the same length. If they are not, this is a
  // course that happens to cross its own start, not a lapped race.
  const median = [...lapDistances].sort((a, b) => a - b)[
    Math.floor(lapDistances.length / 2)
  ];
  const consistent = lapDistances.every(
    (d) => Math.abs(d - median) < median * 0.2
  );
  if (!consistent || median < MIN_LAP_M) return empty;

  /* The second lap, not the first: the opening one carries the neutralised
     start and the roll-out to the circuit, which are not part of the loop. */
  const pick = boundaries.length > 3 ? 1 : 0;
  const from = boundaries[pick];
  const to = boundaries[pick + 1];

  const offsetM = points[from][3];
  const lap = points
    .slice(from, to + 1)
    .map((p) => [p[0], p[1], p[2], p[3] - offsetM] as [number, number, number, number]);

  return {
    boundaries,
    lapCount: Math.round(totalM / median),
    lapDistanceM: median,
    lap,
  };
}

/** Metres between two [lat, lng] pairs. */
function metresFrom(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * 111_320;
  const dLng = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

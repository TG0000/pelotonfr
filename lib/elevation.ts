/**
 * The ground under a course.
 *
 * Strava's segment explorer gives a shape and no heights, so the profile is
 * read separately — and where it is read from decides what the profile is worth.
 *
 * The IGN's RGE ALTI is the national elevation model: a metre to five metres of
 * resolution over France, against the ninety-odd of the global models. On a
 * village circuit that is the difference between a ramp and the pitch that
 * decides the race. It also samples along a whole line in one request, so a
 * circuit costs one call rather than one per hundred points — which is what
 * made the previous approach both coarse and slow enough to fail.
 *
 * Open-Meteo stays as the fallback: for the rare race outside France, and for
 * the day the IGN is down.
 */

const IGN_URL =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json";

/** A point on the ground: latitude, longitude, metres above sea level. */
export type GroundPoint = [number, number, number];

/**
 * How many vertices of our own line we send.
 *
 * The service resamples between them, so sending every point of a dense track
 * would only lengthen the URL. A hundred and fifty describes any village
 * circuit's corners.
 */
const MAX_VERTICES = 150;

function thin(
  points: Array<[number, number]>,
  limit: number
): Array<[number, number]> {
  if (points.length <= limit) return points;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < limit; i++) {
    out.push(points[Math.round((i / (limit - 1)) * (points.length - 1))]);
  }
  return out;
}

/**
 * Heights along a line, evenly spaced, from the IGN.
 *
 * Returns the sampled points themselves rather than heights alone: the service
 * spaces them by distance along the line, which is exactly what a profile wants
 * and better than anything we could interpolate back onto our own vertices.
 */
export async function groundAlongLine(
  points: Array<[number, number]>,
  samples: number
): Promise<GroundPoint[] | null> {
  if (points.length < 2 || samples < 2) return null;

  const line = thin(points, MAX_VERTICES);
  const params = new URLSearchParams({
    lon: line.map((p) => p[1].toFixed(6)).join("|"),
    lat: line.map((p) => p[0].toFixed(6)).join("|"),
    resource: "ign_rge_alti_wld",
    sampling: String(Math.min(5_000, Math.round(samples))),
  });

  try {
    const res = await fetch(`${IGN_URL}?${params}`, {
      next: { revalidate: 604_800 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      elevations?: Array<{ lat: number; lon: number; z: number }>;
    };
    const rows = data.elevations ?? [];
    if (rows.length < 2) return null;

    // The model answers -99999 where it has no data — over water, mostly, and
    // at the odd hole. Carried through it would draw a cliff, so the last known
    // height stands until a real one comes back.
    let last = rows.find((r) => r.z > -1000)?.z ?? 0;
    return rows.map((r) => {
      if (r.z > -1000) last = r.z;
      return [r.lat, r.lon, last] as GroundPoint;
    });
  } catch {
    return null;
  }
}

/**
 * The ground around a circuit, as a grid.
 *
 * A profile says how much a lap climbs; it does not say what the lap is *in*.
 * A rider reading "77 m a lap" learns nothing about whether the climb is a
 * wall out of a river valley or a long drag across a plateau — and that is the
 * difference between a race that splits and one that does not.
 *
 * The IGN samples along a line, not over an area, so the grid is read one row
 * at a time. Thirty-two rows of thirty-two is a thousand heights for
 * thirty-two requests: coarse enough to be affordable, fine enough that a
 * bocage valley reads as a valley. It is computed once per circuit and kept.
 */
export interface Ground {
  /** Points per side. */
  size: number;
  west: number;
  south: number;
  east: number;
  north: number;
  /** Heights, row-major from the south edge northwards. */
  z: number[];
  minZ: number;
  maxZ: number;
}

export async function groundGrid(
  bounds: { west: number; south: number; east: number; north: number },
  size = 32
): Promise<Ground | null> {
  const rows: number[][] = [];

  for (let i = 0; i < size; i++) {
    const lat = bounds.south + ((bounds.north - bounds.south) * i) / (size - 1);
    const line = await groundAlongLine(
      [
        [lat, bounds.west],
        [lat, bounds.east],
      ],
      size
    );
    // One missing row would tear the mesh, so a failure abandons the grid
    // rather than leaving a seam a reader would take for a cliff.
    if (!line || line.length < size) return null;
    rows.push(line.slice(0, size).map((p) => p[2]));

    // The service is free and public; asking for a thousand points politely.
    await new Promise((r) => setTimeout(r, 120));
  }

  const z = rows.flat();
  return {
    size,
    ...bounds,
    z,
    minZ: Math.min(...z),
    maxZ: Math.max(...z),
  };
}

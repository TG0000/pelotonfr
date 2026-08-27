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

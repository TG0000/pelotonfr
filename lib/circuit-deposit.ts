import { decodePolyline, distancesAlong, metresBetween } from "@/lib/polyline";
import { groundAlongLine } from "@/lib/elevation";
import type { SqlLike } from "@/lib/strava/types";

/**
 * Puts a circuit on a race because somebody says that is the course.
 *
 * Both automatic sources are inferences. A ride matched to a race can be the
 * warm-up; a loop recognised among a sector's segments can belong to the next
 * village — it did, twenty-nine times, until a circuit was required to be
 * centred on the commune whose name the race carries.
 *
 * A deposit is not an inference, so it outranks both and neither overwrites it.
 * A Strava segment is the form it takes because that is what a rider has to
 * hand: they find the loop on Strava, paste the link, and the circuit is on the
 * race page for everyone.
 */

export interface Deposited {
  name: string;
  lengthM: number;
  gainM: number;
  points: number;
  /** How far the middle of the loop sits from the commune. Worth stating. */
  centreM: number;
}

export async function depositSegmentCircuit(
  sql: SqlLike,
  token: string,
  raceId: string,
  segmentId: number
): Promise<Deposited> {
  const res = await fetch(
    `https://www.strava.com/api/v3/segments/${segmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Ce segment n'existe pas ou n'est pas public."
        : `Strava a répondu ${res.status}.`
    );
  }

  const segment = (await res.json()) as {
    name?: string;
    map?: { polyline?: string };
  };
  const encoded = segment.map?.polyline;
  if (!encoded) throw new Error("Ce segment ne porte pas de tracé.");

  const line = decodePolyline(encoded);
  if (line.length < 20) throw new Error("Tracé trop court pour être un circuit.");

  const distances = distancesAlong(line);
  const lengthM = distances[distances.length - 1];

  // The ground, read at the same resolution as everywhere else.
  const wanted = Math.min(2_000, Math.max(50, Math.round(lengthM / 20)));
  const ground = await groundAlongLine(line, wanted);
  if (!ground) throw new Error("Le relief n'a pas pu être lu pour ce tracé.");

  const track = ground.map((g) => [g[0], g[1]] as [number, number]);
  const along = distancesAlong(track);
  const points = track.map((p, i) => [
    Number(p[1].toFixed(6)),
    Number(p[0].toFixed(6)),
    Number(ground[i][2].toFixed(2)),
    Math.round(along[i]),
  ]);

  const alts = ground.map((g) => g[2]);
  let gain = 0;
  let reference = alts[0];
  for (const a of alts) {
    if (a > reference + 2) {
      gain += a - reference;
      reference = a;
    } else if (a < reference) reference = a;
  }

  const lats = track.map((p) => p[0]);
  const lngs = track.map((p) => p[1]);
  const centre: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];

  const [race] = await sql(
    `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM races WHERE id = $1::uuid`,
    [raceId]
  );
  const r = race as { lat: number; lng: number } | undefined;
  const centreM = r
    ? metresBetween(centre, [Number(r.lat), Number(r.lng)])
    : 0;

  await sql(
    `INSERT INTO race_traces (race_id, source, strava_segment, points, distance_m,
                              elevation_gain_m, min_elevation_m, max_elevation_m,
                              bounds, centre)
     VALUES ($1::uuid, 'depose', $2::bigint, $3::jsonb, $4, $5, $6, $7,
             $8::jsonb, ST_MakePoint($9::float8, $10::float8)::geography)
     ON CONFLICT (race_id) DO UPDATE
        SET source = 'depose', strava_segment = EXCLUDED.strava_segment,
            points = EXCLUDED.points, distance_m = EXCLUDED.distance_m,
            elevation_gain_m = EXCLUDED.elevation_gain_m,
            min_elevation_m = EXCLUDED.min_elevation_m,
            max_elevation_m = EXCLUDED.max_elevation_m,
            bounds = EXCLUDED.bounds, centre = EXCLUDED.centre,
            updated_at = now()`,
    [
      raceId,
      segmentId,
      JSON.stringify(points),
      Math.round(lengthM),
      Math.round(gain),
      Math.round(Math.min(...alts)),
      Math.round(Math.max(...alts)),
      JSON.stringify({
        west: Math.min(...lngs),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        north: Math.max(...lats),
      }),
      centre[1],
      centre[0],
    ]
  );

  return {
    name: segment.name ?? "Circuit",
    lengthM,
    gainM: Math.round(gain),
    points: points.length,
    centreM,
  };
}

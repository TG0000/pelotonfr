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
 * A deposit is a proposal. It is held for operator review before publication.
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
  segmentId: number,
  userId: string
): Promise<Deposited> {
  const res = await fetch(
    `https://www.strava.com/api/v3/segments/${segmentId}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }
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
    `INSERT INTO circuit_submissions(race_id,user_id,segment_id,name,payload) VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb)`,
    [raceId,userId,segmentId,segment.name ?? "Circuit",JSON.stringify({
      points,distance_m:Math.round(lengthM),elevation_gain_m:Math.round(gain),
      min_elevation_m:Math.round(Math.min(...alts)),max_elevation_m:Math.round(Math.max(...alts)),
      bounds:{west:Math.min(...lngs),south:Math.min(...lats),east:Math.max(...lngs),north:Math.max(...lats)},
      centreLng:centre[1],centreLat:centre[0],centreM
    })]
  );

  return {
    name: segment.name ?? "Circuit",
    lengthM,
    gainM: Math.round(gain),
    points: points.length,
    centreM,
  };
}

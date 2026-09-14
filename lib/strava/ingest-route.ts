import { decodePolyline, distancesAlong } from "@/lib/polyline";
import { groundAlongLine } from "@/lib/elevation";
import type { SqlLike } from "./types";

/**
 * Un itinéraire Strava devient le tracé d'une course.
 *
 * Il n'a pas été roulé le jour J, donc il ne remplace jamais une sortie ; il
 * remplace une reconnaissance parmi les segments, et il comble un vide. Le
 * relief est relu sur le terrain public, comme pour un segment.
 */
export async function saveRouteTrace(
  sql: SqlLike,
  raceId: string,
  route: { id: number; name: string; polyline: string; distanceM: number }
): Promise<"stored" | "kept" | "unavailable"> {
  const line = decodePolyline(route.polyline);
  if (line.length < 20) return "unavailable";
  const wanted = Math.min(2_000, Math.max(50, Math.round(route.distanceM / 25)));
  const ground = await groundAlongLine(line, wanted);
  if (!ground) return "unavailable";
  const track = ground.map((g) => [g[0], g[1]] as [number, number]);
  const along = distancesAlong(track);
  const points = track.map((p, i) => [Number(p[1].toFixed(6)), Number(p[0].toFixed(6)), Number(ground[i][2].toFixed(2)), Math.round(along[i])]);
  const alts = ground.map((g) => g[2]);
  let gain = 0, ref = alts[0];
  for (const a of alts) { if (a > ref + 2) { gain += a - ref; ref = a; } else if (a < ref) ref = a; }
  const lats = track.map((p) => p[0]); const lngs = track.map((p) => p[1]);
  const bounds = { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) };
  const rows = await sql(
    `INSERT INTO race_traces (race_id, source, strava_segment, points, distance_m, elevation_gain_m, min_elevation_m, max_elevation_m, bounds, centre)
     VALUES ($1::uuid, 'route', $2::bigint, $3::jsonb, $4, $5, $6, $7, $8::jsonb, ST_MakePoint($9::float8, $10::float8)::geography)
     ON CONFLICT (race_id) DO UPDATE
        SET source = 'route', strava_segment = EXCLUDED.strava_segment, points = EXCLUDED.points, distance_m = EXCLUDED.distance_m,
            elevation_gain_m = EXCLUDED.elevation_gain_m, min_elevation_m = EXCLUDED.min_elevation_m, max_elevation_m = EXCLUDED.max_elevation_m,
            bounds = EXCLUDED.bounds, centre = EXCLUDED.centre, updated_at = now()
      WHERE race_traces.source = 'segment'
      RETURNING race_id`,
    [raceId, route.id, JSON.stringify(points), Math.round(along[along.length - 1]), Math.round(gain), Math.round(Math.min(...alts)), Math.round(Math.max(...alts)), JSON.stringify(bounds), (bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
  );
  return rows.length > 0 ? "stored" : "kept";
}

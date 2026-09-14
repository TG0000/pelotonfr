import type { SqlLike } from "../../../lib/strava/types";
import type { CircuitCandidate } from "../../../lib/circuit";
import { distancesAlong, resample } from "../../../lib/polyline";
import { groundAlongLine } from "../../../lib/elevation";
import { elevationsFor, interpolateElevations } from "../../../lib/circuit";

/**
 * Garde une boucle reconnue comme circuit d'une course. Le relief est lu
 * sur le terrain public ; une sortie enregistrée n'est jamais écrasée.
 */
export async function storeCircuit(sql: SqlLike, raceId: string, circuit: CircuitCandidate): Promise<boolean> {
  const wanted = Math.min(2_000, Math.max(50, Math.round(circuit.lengthM / 20)));
  const ground = await groundAlongLine(circuit.points, wanted);
  const track: Array<[number, number]> = ground ? ground.map((g) => [g[0], g[1]]) : resample(circuit.points, 20);
  const elevations = ground ? ground.map((g) => g[2]) : interpolateElevations(track.length, (await elevationsFor(track, circuit.lengthM)) ?? []);
  const distances = distancesAlong(track);
  const points = track.map((p, i) => [Number(p[1].toFixed(6)), Number(p[0].toFixed(6)), Number((elevations[i] ?? 0).toFixed(2)), Math.round(distances[i])]);
  let gain = 0, reference = elevations[0] ?? 0;
  for (const e of elevations) { if (e > reference + 2) { gain += e - reference; reference = e; } else if (e < reference) reference = e; }
  const lats = track.map((p) => p[0]); const lngs = track.map((p) => p[1]);
  const alts = elevations.filter((e) => Number.isFinite(e));
  const rows = await sql(
    `INSERT INTO race_traces (race_id, source, strava_segment, points, distance_m, elevation_gain_m, min_elevation_m, max_elevation_m, bounds, centre)
     VALUES ($1::uuid, 'segment', $10::bigint, $2::jsonb, $3, $4, $5, $6, $7::jsonb, ST_MakePoint($8::float8, $9::float8)::geography)
     ON CONFLICT (race_id) DO NOTHING
     RETURNING race_id`,
    [raceId, JSON.stringify(points), Math.round(circuit.lengthM), Math.round(gain), alts.length ? Math.round(Math.min(...alts)) : 0, alts.length ? Math.round(Math.max(...alts)) : 0,
     JSON.stringify({ west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) }),
     (Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2, circuit.segmentId]
  );
  return rows.length > 0;
}

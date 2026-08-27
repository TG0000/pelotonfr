/**
 * Redraws every stored trace at the resolution a profile needs.
 *
 * The traces on file were drawn for a map. A map forgives a point every hundred
 * metres; a profile does not, and a lapped race least of all — one lap of a
 * 72 km ride was drawn from fifty points, one every 130 metres, which reads as
 * a sketch of the course rather than the course.
 *
 *   npx tsx scripts/db/redraw-traces.ts [--dry-run] [--source=segment|strava]
 *
 * The two sources are redrawn differently because they are limited differently:
 *
 *   segment — the shape is Strava's own polyline, which draws a straight
 *     kilometre with two points. The shape is all we will ever get, so the
 *     track is walked out every fifteen metres and the ground is read again at
 *     that spacing. No Strava call at all: the geometry is already on file.
 *   strava  — a rider's ride, simplified on the ground track alone when it was
 *     stored, so every rise along a straight collapsed. The streams are read
 *     again and simplified with the profile taken into account. One Strava read
 *     apiece, paced well under the ceiling.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { getAccessToken } from "../../lib/db/queries/strava";
import { getActivityStreams } from "../../lib/strava/client";
import { summariseTrace } from "../../lib/trace";
import { elevationsFor, interpolateElevations } from "../../lib/circuit";
import { distancesAlong, resample } from "../../lib/polyline";
import { groundAlongLine } from "../../lib/elevation";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const SPACING_M = 20;
/** A read a second is far inside Strava's hundred a quarter of an hour. */
const STRAVA_PACE_MS = 1_500;

type Stored = Array<[number, number, number, number]>;

interface Row {
  race_id: string;
  name: string;
  source: string;
  points: Stored;
  distance_m: number;
  strava_activity: string | null;
}

function elevationGain(altitudes: number[]): number {
  let gain = 0;
  let reference = altitudes[0] ?? 0;
  for (const a of altitudes) {
    if (a > reference + 2) {
      gain += a - reference;
      reference = a;
    } else if (a < reference) reference = a;
  }
  return gain;
}

async function write(
  raceId: string,
  points: Stored,
  dryRun: boolean
): Promise<void> {
  const alts = points.map((p) => p[2]).filter((a) => Number.isFinite(a));
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  if (dryRun) return;

  await sql(
    `UPDATE race_traces
        SET points = $2::jsonb,
            distance_m = $3,
            elevation_gain_m = $4,
            min_elevation_m = $5,
            max_elevation_m = $6,
            bounds = $7::jsonb,
            centre = ST_MakePoint($8::float8, $9::float8)::geography,
            updated_at = now()
      WHERE race_id = $1::uuid`,
    [
      raceId,
      JSON.stringify(points),
      Math.round(points[points.length - 1][3]),
      Math.round(elevationGain(alts)),
      alts.length ? Math.round(Math.min(...alts)) : 0,
      alts.length ? Math.round(Math.max(...alts)) : 0,
      JSON.stringify({
        west: Math.min(...lngs),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        north: Math.max(...lats),
      }),
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ]
  );
}

/** The shape is fixed; only the ground under it can be read better. */
async function redrawSegment(row: Row, dryRun: boolean): Promise<number> {
  const latlng: Array<[number, number]> = row.points.map((p) => [p[1], p[0]]);
  const wanted = Math.min(2_000, Math.max(50, Math.round(row.distance_m / SPACING_M)));

  const ground = await groundAlongLine(latlng, wanted);
  let track: Array<[number, number]>;
  let elevations: number[];

  if (ground) {
    track = ground.map((g) => [g[0], g[1]]);
    elevations = ground.map((g) => g[2]);
  } else {
    track = resample(latlng, SPACING_M);
    const sampled = await elevationsFor(track, row.distance_m);
    if (!sampled) throw new Error("aucun modèle d'altitude n'a répondu");
    elevations = interpolateElevations(track.length, sampled);
  }

  const distances = distancesAlong(track);
  const points: Stored = track.map((p, i) => [
    Number(p[1].toFixed(6)),
    Number(p[0].toFixed(6)),
    Number((elevations[i] ?? 0).toFixed(2)),
    Math.round(distances[i]),
  ]);

  await write(row.race_id, points, dryRun);
  return points.length;
}

/** The ride still exists; it was the simplification that lost the profile. */
async function redrawRide(
  row: Row,
  token: string,
  dryRun: boolean
): Promise<number> {
  if (!row.strava_activity) throw new Error("aucune activité Strava en référence");
  const streams = await getActivityStreams(token, Number(row.strava_activity));
  if (!streams) throw new Error("Strava n'a pas rendu le tracé de l'activité");

  const trace = summariseTrace(streams.latlng, streams.altitude, streams.distance);
  if (!trace) throw new Error("tracé trop court pour être résumé");

  const points: Stored = trace.points.map((p) => [
    Number(p[0].toFixed(6)),
    Number(p[1].toFixed(6)),
    Number(p[2].toFixed(2)),
    Math.round(p[3]),
  ]);

  await write(row.race_id, points, dryRun);
  return points.length;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const only = process.argv
    .find((a) => a.startsWith("--source="))
    ?.split("=")[1];

  const rows = (await sql(
    `SELECT t.race_id, r.name, t.source, t.points, t.distance_m,
            t.strava_activity::text AS strava_activity
       FROM race_traces t JOIN races r ON r.id = t.race_id
      WHERE ($1::text IS NULL OR t.source = $1::text)
      ORDER BY t.source, r.race_date DESC NULLS LAST`,
    [only ?? null]
  )) as unknown as Row[];

  console.log(`${rows.length} traces to redraw${dryRun ? " (dry run)" : ""}.\n`);

  let token: string | null = null;
  if (rows.some((r) => r.source === "strava")) {
    const [conn] = await sql(
      `SELECT user_id FROM strava_connections ORDER BY updated_at DESC LIMIT 1`
    );
    if (conn) token = await getAccessToken((conn as { user_id: string }).user_id);
    if (!token) console.warn("No Strava token: rides will be left as they are.\n");
  }

  let redrawn = 0;
  let before = 0;
  let after = 0;

  for (const row of rows) {
    const was = row.points.length;
    let now = 0;
    try {
      if (row.source === "segment") {
        now = await redrawSegment(row, dryRun);
        // One request per circuit at the IGN, so only ordinary courtesy.
        await new Promise((r) => setTimeout(r, 600));
      } else if (row.source === "strava" && token) {
        now = await redrawRide(row, token, dryRun);
        await new Promise((r) => setTimeout(r, STRAVA_PACE_MS));
      }
    } catch (err) {
      console.error(
        `  ${row.name.slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    if (now === 0) continue;
    redrawn++;
    before += was;
    after += now;
    const metres = row.distance_m / now;
    console.log(
      `  ${row.name.slice(0, 44).padEnd(46)} ${String(was).padStart(4)} → ` +
        `${String(now).padStart(5)} points (${metres.toFixed(0)} m/point)`
    );
  }

  console.log(
    `\n${redrawn} traces redrawn: ${before} points become ${after}.`
  );
  return { seen: rows.length, written: redrawn };
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

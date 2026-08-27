/**
 * Reads the climbs around each upcoming race.
 *
 *   npx tsx scripts/scrapers/strava-segments.ts [--limit=60] [--force]
 *
 * Strava's segment explorer answers for a geographic box, which is exactly the
 * question "what will this race climb". It needs an athlete's token, and almost
 * no reader will have connected one — so the answer is fetched once with
 * whatever token is available and stored, and every reader gets it. One
 * connected rider unlocks the sector for everyone.
 *
 * Only races that are still to come are asked about: the point is preparation.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { getAccessToken } from "../../lib/db/queries/strava";
import {
  exploreSegments,
  StravaRateLimitError,
  type StravaSegment,
} from "../../lib/strava/client";
import {
  findCircuits,
  elevationsFor,
  interpolateElevations,
  type CircuitCandidate,
} from "../../lib/circuit";
import { distancesAlong, resample } from "../../lib/polyline";
import { groundAlongLine } from "../../lib/elevation";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

/** About 5 km each way — the ground a village circuit covers. */
const BOX_DEGREES = 0.045;

/**
 * How finely the sector is cut up when the first pass finds no circuit.
 *
 * Three by three: nine boxes over the same ground, so up to ninety segments
 * where one box yields ten. Four by four would yield more and cost sixteen
 * reads, which is a sixtieth of the day for one race.
 */
const GRID = 3;

/** The same sector, as a grid of smaller boxes. */
function subdivide(
  box: { south: number; west: number; north: number; east: number },
  cells: number
): Array<{ south: number; west: number; north: number; east: number }> {
  const dLat = (box.north - box.south) / cells;
  const dLng = (box.east - box.west) / cells;
  const out = [];
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      out.push({
        south: box.south + i * dLat,
        north: box.south + (i + 1) * dLat,
        west: box.west + j * dLng,
        east: box.west + (j + 1) * dLng,
      });
    }
  }
  return out;
}

/** Hills do not move; re-asking sooner than this buys nothing. */
const REFRESH_DAYS = 120;

/**
 * Strava allows 100 reads per fifteen minutes and 1 000 per day.
 *
 * Nine and a half seconds a read holds the quarter-hour ceiling whatever a race
 * costs — and races no longer cost the same, since a sector that yields no
 * circuit is asked again as nine smaller boxes. Pacing per read rather than per
 * race is what keeps that honest.
 */
const PER_READ_MS = 9_500;

/**
 * The day's allowance, and the reason a pass stops early.
 *
 * Left to itself a pass of three hundred races could ask for two thousand reads
 * and be cut off half way, with no way of knowing which halves were done. It
 * stops when the budget is spent and says so.
 */
const DEFAULT_READ_BUDGET = 900;

/**
 * A segment worth naming to a racer.
 *
 * Descents and flat sprints are noise when the question is what the course
 * will climb. And Strava carries a long tail of broken segments — a 17% mean
 * gradient over more than a kilometre is a GPS artefact, not a wall — which
 * would make a gentle sector look savage.
 */
function isWorthShowing(s: StravaSegment): boolean {
  if (s.averageGrade < 3) return false;
  if (s.distanceM < 200) return false;
  if (s.averageGrade > 20) return false;
  if (s.distanceM > 800 && s.averageGrade > 14) return false;
  return true;
}

/**
 * Keeps a recognised circuit as the race's course.
 *
 * Strava gives the shape but not the ground, so the profile is read from the
 * public elevation model — which means a course can be profiled before anyone
 * has ridden it with a computer running. A trace contributed by an actual
 * rider is better and is never overwritten by this.
 */
async function storeCircuit(
  raceId: string,
  circuit: CircuitCandidate
): Promise<void> {
  // Strava draws a straight kilometre with two points, which is honest about
  // the shape and useless as a profile: the ground under that kilometre gets
  // read once. The IGN resamples the line itself and hands back the points it
  // measured, evenly spaced — so a point every twenty metres, each one a real
  // measurement rather than a value interpolated between two distant ones.
  const wanted = Math.min(2_000, Math.max(50, Math.round(circuit.lengthM / 20)));
  const ground = await groundAlongLine(circuit.points, wanted);

  const track: Array<[number, number]> = ground
    ? ground.map((g) => [g[0], g[1]])
    : resample(circuit.points, 20);
  const elevations = ground
    ? ground.map((g) => g[2])
    : interpolateElevations(
        track.length,
        (await elevationsFor(track, circuit.lengthM)) ?? []
      );
  const distances = distancesAlong(track);

  const points = track.map((p, i) => [
    Number(p[1].toFixed(6)), // lng
    Number(p[0].toFixed(6)), // lat
    Math.round(elevations[i] ?? 0),
    Math.round(distances[i]),
  ]);

  let gain = 0;
  let reference = elevations[0] ?? 0;
  for (const e of elevations) {
    if (e > reference + 2) {
      gain += e - reference;
      reference = e;
    } else if (e < reference) {
      reference = e;
    }
  }

  const lats = track.map((p) => p[0]);
  const lngs = track.map((p) => p[1]);
  const alts = elevations.filter((e) => Number.isFinite(e));

  await sql(
    `INSERT INTO race_traces (race_id, source, points, distance_m,
                              elevation_gain_m, min_elevation_m, max_elevation_m,
                              bounds, centre)
     VALUES ($1::uuid, 'segment', $2::jsonb, $3, $4, $5, $6, $7::jsonb,
             ST_MakePoint($8::float8, $9::float8)::geography)
     -- A trace a rider actually recorded is the better source and stands.
     ON CONFLICT (race_id) DO NOTHING`,
    [
      raceId,
      JSON.stringify(points),
      Math.round(circuit.lengthM),
      Math.round(gain),
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

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 60;
  const force = process.argv.includes("--force");
  const readsArg = process.argv.find((a) => a.startsWith("--reads="));
  const readBudget = readsArg
    ? Number(readsArg.split("=")[1])
    : DEFAULT_READ_BUDGET;

  const connections = (await sql(
    `SELECT user_id FROM strava_connections ORDER BY updated_at DESC LIMIT 1`
  )) as Array<{ user_id: string }>;

  if (connections.length === 0) {
    console.log("No Strava account connected — nothing can be asked.");
    return { seen: 0, written: 0 };
  }

  const token = await getAccessToken(connections[0].user_id);
  if (!token) {
    console.log("The stored Strava token could not be refreshed.");
    return { seen: 0, written: 0 };
  }

  const races = (await sql(
    `SELECT id, name,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
       FROM races
      WHERE location IS NOT NULL
        AND is_cancelled = false
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
        AND ($2::boolean
             OR segments_fetched_at IS NULL
             OR segments_fetched_at < now() - ($3::int * INTERVAL '1 day'))
      -- Whoever races first, first.
      --
      -- This used to be ORDER BY random(), on the reasoning that starting at
      -- the same end would re-read the same sector every run — but the clause
      -- above already excludes anything read, so there was nothing to re-read.
      -- What random() actually did was give a race in March the same claim on a
      -- rate-limited budget as the one somebody rides on Saturday. Strava allows
      -- about fifty sectors a quarter of an hour and two thousand are waiting,
      -- so the order is the whole of the policy.
      --
      -- A race somebody has put in their calendar comes first regardless: they
      -- have said they are going, which is the strongest signal we ever get
      -- about which parcours is worth knowing.
      ORDER BY EXISTS (SELECT 1 FROM user_favorites f WHERE f.race_id = races.id) DESC,
               COALESCE(race_date_end, race_date) ASC
      LIMIT $1::int`,
    [limit, force, REFRESH_DAYS]
  )) as Array<Record<string, unknown>>;

  console.log(`${races.length} races to read.\n`);

  let withClimbs = 0;
  let stored = 0;
  let circuitsFound = 0;
  let deepened = 0;
  let read = 0;

  for (const race of races) {
    if (read >= readBudget) break;
    const lat = Number(race.lat);
    const lng = Number(race.lng);
    const bounds = {
      south: lat - BOX_DEGREES,
      west: lng - BOX_DEGREES,
      north: lat + BOX_DEGREES,
      east: lng + BOX_DEGREES,
    };

    try {
      // Asked twice: the explorer returns ten at a time, and the categorised
      // call surfaces climbs the unfiltered one ranks below local favourites.
      const found = new Map<number, StravaSegment>();
      const [general, climbs] = await Promise.all([
        exploreSegments(token, bounds),
        exploreSegments(token, bounds, { minCategory: 1 }),
      ]);
      for (const s of [...general, ...climbs]) found.set(s.id, s);
      read += 2;
      await new Promise((r) => setTimeout(r, PER_READ_MS * 2));

      /* The circuit first, because it is the thing a rider actually wants.
         Riders trace the race loop into Strava — it is the road they train on —
         and the explorer hands back its full shape at no extra cost. What
         separates it from every climb and descent in the sector is that it
         closes: the loops that turn out to be real circuits finish within a
         handful of metres of where they start. */
      let circuit = findCircuits([...found.values()], { lat, lng })[0];

      /* Nothing yet, so ask in smaller pieces.
         The explorer answers with ten segments per box however large the box
         is, ranked by its own idea of popularity — so a sector with two hundred
         segments hands back the same ten every time, and the race loop is
         simply not among them. Argentan returned one segment and no circuit;
         asked as nine boxes it returned sixty-seven, including "circuit
         Sarceaux" and "Fleure fsgt", which are the race.

         Held back until the cheap question has failed, because it costs nine
         reads against a thousand a day: most sectors answer on the first
         attempt and only the stubborn ones are worth the budget. */
      if (!circuit) {
        for (const cell of subdivide(bounds, GRID)) {
          if (read >= readBudget) break;
          for (const s of await exploreSegments(token, cell)) found.set(s.id, s);
          read++;
          await new Promise((r) => setTimeout(r, PER_READ_MS));
        }
        circuit = findCircuits([...found.values()], { lat, lng })[0];
        if (circuit) deepened++;
      }

      if (circuit) {
        await storeCircuit(race.id as string, circuit);
        circuitsFound++;
        console.log(
          `  ${String(race.name).slice(0, 38).padEnd(40)} circuit « ${circuit.name.slice(0, 26)} »` +
            ` ${(circuit.lengthM / 1000).toFixed(1)} km${circuit.named ? " (nommé)" : ""}`
        );
      }

      const byId = new Map<number, StravaSegment>();
      for (const s of found.values()) {
        if (isWorthShowing(s)) byId.set(s.id, s);
      }
      const keep = [...byId.values()]
        .sort((a, b) => b.elevationM! - a.elevationM! || b.averageGrade - a.averageGrade)
        .slice(0, 8);

      if (keep.length > 0) {
        await sql(
          `INSERT INTO race_segments
             (race_id, segment_id, name, distance_m, average_grade,
              elevation_m, climb_category, start_lat, start_lng)
           SELECT $1::uuid, d.*
             FROM UNNEST($2::bigint[], $3::varchar[], $4::numeric[], $5::numeric[],
                         $6::numeric[], $7::smallint[], $8::float8[], $9::float8[])
               AS d(segment_id, name, distance_m, average_grade,
                    elevation_m, climb_category, start_lat, start_lng)
           ON CONFLICT (race_id, segment_id) DO UPDATE SET
             name = EXCLUDED.name,
             distance_m = EXCLUDED.distance_m,
             average_grade = EXCLUDED.average_grade,
             elevation_m = EXCLUDED.elevation_m,
             climb_category = EXCLUDED.climb_category,
             fetched_at = now()`,
          [
            race.id,
            keep.map((s) => s.id),
            keep.map((s) => s.name),
            keep.map((s) => s.distanceM),
            keep.map((s) => s.averageGrade),
            keep.map((s) => s.elevationM ?? 0),
            keep.map((s) => s.climbCategory ?? 0),
            keep.map((s) => s.startLat ?? 0),
            keep.map((s) => s.startLng ?? 0),
          ]
        );
        withClimbs++;
        stored += keep.length;
        console.log(
          `  ${String(race.name).slice(0, 42).padEnd(44)} ${keep.length} difficulté(s)` +
            ` · la plus dure ${keep[0].averageGrade}% sur ${Math.round(keep[0].distanceM)} m`
        );
      }

      // Marked either way: a flat sector is an answer, not a failure.
      await sql(
        `UPDATE races SET segments_fetched_at = now() WHERE id = $1::uuid`,
        [race.id]
      );
    } catch (err) {
      if (err instanceof StravaRateLimitError) {
        // Stop rather than carry on marking races as read that were never
        // looked at. The rest keep their null timestamp and are picked up by
        // the next run.
        console.log(`\n${err.message} Stopping; ${races.length - read} races left for next time.`);
        break;
      }
      console.error(
        `  ${String(race.name).slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (read >= readBudget) {
      console.log(
        `\nStopping at ${read} reads: the day's budget is spent. ` +
          `The rest keep their turn — the order is by date, so tomorrow's pass ` +
          `resumes where this one stopped.`
      );
      break;
    }
  }

  console.log(
    `\n${circuitsFound} circuits recognised` +
      (deepened > 0 ? `, ${deepened} of them only once the sector was read in nine boxes` : "") +
      `. ${withClimbs} of ${races.length} sectors carry a climb worth naming ` +
      `(${stored} segments stored, ${read} reads spent).`
  );
  return {
    seen: races.length,
    written: withClimbs,
    metadata: { circuits: circuitsFound, segments: stored, deepened, reads: read },
  };
}

async function tracked() {
  const run = await startRun(sql, "strava-segments");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

/**
 * Reconstruit les parcours depuis les guides techniques lus par la vision.
 *
 *   npx tsx scripts/db/route-guides.ts [--race=<uuid>] [--force]
 *
 * Les pages « itinéraire » d'un guide sont regroupées par étape (une page
 * dont le kilométrage repart à zéro ouvre une étape ; une page sans numéro
 * continue la précédente). Chaque étape est placée, routée, profilée. Un tour
 * range ses étapes dans race_stage_traces ; une course d'un jour va dans
 * race_traces, source « guide », sans écraser une sortie enregistrée.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { placeWaypoints, routeThrough, buildTrace, dropDetours, type GuidePoint } from "../../lib/guide-route";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

interface Page { stage_number: number | null; page_number: number; points: GuidePoint[] }

function groupStages(pages: Page[]): Array<{ stage: number; points: GuidePoint[] }> {
  const stages: Array<{ stage: number; points: GuidePoint[] }> = [];
  let current: { stage: number; points: GuidePoint[] } | null = null;
  for (const page of pages.sort((a, b) => a.page_number - b.page_number)) {
    const first = page.points.find((p) => p.km != null);
    const restarts = first != null && (first.km ?? 0) <= 1 && current != null && current.points.some((p) => (p.km ?? 0) > 5);
    const opens = page.stage_number != null && (current == null || page.stage_number !== current.stage);
    if (current == null || opens || restarts) {
      current = { stage: page.stage_number ?? (current ? current.stage + 1 : 1), points: [] };
      stages.push(current);
    }
    current.points.push(...page.points);
  }
  return stages;
}

async function main() {
  const raceArg = process.argv.find((a) => a.startsWith("--race="));
  const only = raceArg ? raceArg.split("=")[1] : null;
  const force = process.argv.includes("--force");
  const races = await sql(
    `SELECT DISTINCT g.race_id::text AS race_id, r.name, r.race_date::text AS date,
            ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
            (SELECT count(*) FROM race_stages s WHERE s.race_id = r.id) AS stages
       FROM guide_pages g JOIN races r ON r.id = g.race_id
      WHERE g.kind = 'itineraire' AND jsonb_array_length(g.points) > 2
        AND ($1::uuid IS NULL OR g.race_id = $1::uuid)
      ORDER BY date`,
    [only]
  );
  let built = 0;
  for (const race of races as Array<Record<string, unknown>>) {
    const raceId = race.race_id as string;
    const pages = (await sql(
      `SELECT stage_number, page_number, points FROM guide_pages WHERE race_id = $1::uuid AND kind = 'itineraire' AND jsonb_array_length(points) > 2`,
      [raceId]
    )) as unknown as Page[];
    const stages = groupStages(pages);
    // Un tour range ses étapes à part : dès qu'une page est numérotée, ou que
    // la fédération connaît plusieurs étapes, ou que le guide en découpe plusieurs.
    const multi = Number(race.stages) > 1 || stages.length > 1 || pages.some((p) => p.stage_number != null);
    console.log(`\n${String(race.name).slice(0, 60)} — ${stages.length} étape(s) dans le guide`);
    const start = race.lat != null ? { lat: Number(race.lat), lng: Number(race.lng) } : null;
    if (!start) { console.log("  course sans position : impossible de placer le premier point"); continue; }
    for (const st of stages) {
      if (!force) {
        const [done] = multi
          ? await sql(`SELECT 1 FROM race_stage_traces WHERE race_id = $1::uuid AND stage_number = $2::int`, [raceId, st.stage])
          : await sql(`SELECT 1 FROM race_traces WHERE race_id = $1::uuid`, [raceId]);
        if (done) { console.log(`  étape ${st.stage} : déjà tracée`); continue; }
      }
      const placed = await placeWaypoints(st.points, start);
      const guideKm = st.points.reduce((m, p) => Math.max(m, p.km ?? 0), 0);
      if (placed.length < 3) { console.log(`  étape ${st.stage} : ${placed.length} point(s) placé(s) sur ${st.points.length}, trop peu`); continue; }
      let routed = await routeThrough(placed);
      if (!routed) { console.log(`  étape ${st.stage} : routage impossible`); continue; }
      let ratio = guideKm > 0 ? routed.distanceM / (guideKm * 1000) : 1;
      if (ratio > 1.25) {
        const kept = dropDetours(placed, routed.legsM);
        if (kept.length >= 3 && kept.length < placed.length) {
          const again = await routeThrough(kept);
          if (again) {
            console.log(`  étape ${st.stage} : ${placed.length - kept.length} détour(s) retiré(s), ${(routed.distanceM / 1000).toFixed(0)} → ${(again.distanceM / 1000).toFixed(0)} km`);
            routed = again;
            ratio = guideKm > 0 ? routed.distanceM / (guideKm * 1000) : 1;
          }
        }
      }
      console.log(`  étape ${st.stage} : ${placed.length}/${st.points.length} points placés, ${(routed.distanceM / 1000).toFixed(1)} km routés pour ${guideKm} km au guide (${Math.round(ratio * 100)} %)`);
      if (guideKm > 0 && (ratio < 0.8 || ratio > 1.25)) { console.log("    écart trop grand, non retenu"); continue; }
      const trace = await buildTrace(routed.line, routed.distanceM);
      if (!trace) { console.log("    relief illisible"); continue; }
      const wp = JSON.stringify(placed.map((p) => ({ km: p.km, place: p.place, label: p.label, lat: p.lat, lng: p.lng })));
      if (multi) {
        await sql(
          `INSERT INTO race_stage_traces (race_id, stage_number, source, points, distance_m, elevation_gain_m, min_elevation_m, max_elevation_m, bounds, waypoints, guide_km)
           VALUES ($1::uuid, $2::int, 'guide', $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
           ON CONFLICT (race_id, stage_number) DO UPDATE SET points = EXCLUDED.points, distance_m = EXCLUDED.distance_m, elevation_gain_m = EXCLUDED.elevation_gain_m,
             min_elevation_m = EXCLUDED.min_elevation_m, max_elevation_m = EXCLUDED.max_elevation_m, bounds = EXCLUDED.bounds, waypoints = EXCLUDED.waypoints, guide_km = EXCLUDED.guide_km, created_at = now()`,
          [raceId, st.stage, JSON.stringify(trace.points), trace.distanceM, trace.elevationGainM, trace.minElevationM, trace.maxElevationM, JSON.stringify(trace.bounds), wp, guideKm || null]
        );
      } else {
        const centre = [(trace.bounds.west + trace.bounds.east) / 2, (trace.bounds.south + trace.bounds.north) / 2];
        await sql(
          `INSERT INTO race_traces (race_id, source, points, distance_m, elevation_gain_m, min_elevation_m, max_elevation_m, bounds, centre)
           VALUES ($1::uuid, 'guide', $2::jsonb, $3, $4, $5, $6, $7::jsonb, ST_MakePoint($8::float8, $9::float8)::geography)
           ON CONFLICT (race_id) DO UPDATE SET source = 'guide', points = EXCLUDED.points, distance_m = EXCLUDED.distance_m, elevation_gain_m = EXCLUDED.elevation_gain_m,
             min_elevation_m = EXCLUDED.min_elevation_m, max_elevation_m = EXCLUDED.max_elevation_m, bounds = EXCLUDED.bounds, centre = EXCLUDED.centre, updated_at = now()
           WHERE race_traces.source = 'segment'`,
          [raceId, JSON.stringify(trace.points), trace.distanceM, trace.elevationGainM, trace.minElevationM, trace.maxElevationM, JSON.stringify(trace.bounds), centre[0], centre[1]]
        );
      }
      built++;
      console.log(`    tracé écrit : ${(trace.distanceM / 1000).toFixed(1)} km, ${trace.elevationGainM} m de dénivelé`);
    }
  }
  console.log(`\n${built} parcours reconstruit(s).`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * Où Street View voit chaque boucle.
 *
 *   npx tsx scripts/scrapers/streetview-coverage.ts [--limit=60] [--race=<uuid>]
 *
 * Le point de terminaison « metadata » de Street View dit, sans rien
 * facturer, s'il existe un panorama près d'un point. On échantillonne un
 * tour tous les cent vingt mètres, et on garde les portions couvertes : le
 * profil les montre, et le panorama sait où il peut aller. Une clé serveur
 * (GOOGLE_MAPS_SERVER_KEY) suffit ; sans elle, rien ne se passe.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { detectLaps } from "../../lib/trace";
import { publicStravaEnabled } from "../../lib/strava/policy";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const STEP_M = 120;
const MAX_SAMPLES = 250;

async function hasPano(key: string, lat: number, lng: number): Promise<boolean | null> {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat.toFixed(6)},${lng.toFixed(6)}&radius=40&source=outdoor&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string };
    if (data.status === "OK") return true;
    if (data.status === "ZERO_RESULTS") return false;
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) { console.log("GOOGLE_MAPS_SERVER_KEY absente : rien à faire."); return { seen: 0, written: 0 }; }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 60;
  const raceArg = process.argv.find((a) => a.startsWith("--race="));
  const only = raceArg ? raceArg.split("=")[1] : null;

  const races = (await sql(
    `SELECT t.race_id::text AS race_id, r.name, t.points, md5(t.points::text) AS trace_hash
       FROM race_traces t JOIN races r ON r.id = t.race_id
       LEFT JOIN race_streetview s ON s.race_id = t.race_id
      WHERE ($1::uuid IS NULL OR t.race_id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR r.race_date >= CURRENT_DATE)
        AND ($3::boolean OR t.source='guide')
        AND (s.race_id IS NULL OR s.trace_hash IS DISTINCT FROM md5(t.points::text) OR s.checked_at < now() - interval '30 days')
      ORDER BY r.race_date LIMIT $2::int`,
    [only, limit, publicStravaEnabled()]
  )) as Array<Record<string, unknown>>;
  console.log(`${races.length} boucle(s) à sonder.`);
  let written = 0;
  let failed = 0;
  for (const race of races) {
    const track = race.points as Array<[number, number, number, number]>;
    const lap = detectLaps(track).lap ?? track;
    const lapM = lap[lap.length - 1][3];
    const step = Math.max(STEP_M, lapM / MAX_SAMPLES);
    const samples: Array<{ m: number; ok: boolean | null }> = [];
    for (let m = 0; m <= lapM; m += step) {
      let i = lap.findIndex((p) => p[3] >= m);
      if (i < 0) i = lap.length - 1;
      samples.push({ m, ok: await hasPano(key, lap[i][1], lap[i][0]) });
    }
    if (!samples.length || samples.some(sample => sample.ok === null)) { failed++; continue; }
    const spans: Array<{ fromM: number; toM: number }> = [];
    let open: { fromM: number; toM: number } | null = null;
    for (const s of samples) {
      if (s.ok) {
        if (!open) open = { fromM: Math.max(0, Math.round(s.m - step / 2)), toM: Math.round(s.m + step / 2) };
        else open.toM = Math.round(s.m + step / 2);
      } else if (open) { spans.push(open); open = null; }
    }
    if (open) spans.push(open);
    for (const sp of spans) sp.toM = Math.min(sp.toM, Math.round(lapM));
    const covered = spans.reduce((a, s) => a + (s.toM - s.fromM), 0);
    await sql(
      `INSERT INTO race_streetview (race_id, spans, sampled, covered_m, lap_m, checked_at, trace_hash)
       VALUES ($1::uuid, $2::jsonb, $3, $4, $5, now(), $6)
       ON CONFLICT (race_id) DO UPDATE SET spans = EXCLUDED.spans, sampled = EXCLUDED.sampled, covered_m = EXCLUDED.covered_m, lap_m = EXCLUDED.lap_m, checked_at = now(), trace_hash = EXCLUDED.trace_hash`,
      [race.race_id, JSON.stringify(spans), samples.length, covered, Math.round(lapM), race.trace_hash]
    );
    written++;
    console.log(`  ${String(race.name).slice(0, 44).padEnd(46)} ${Math.round((covered / lapM) * 100)} % couvert, ${samples.length} points`);
  }
  if (failed) throw new Error(`${failed} couverture(s) non mises à jour : métadonnées incomplètes. Nouvel essai au prochain passage.`);
  return { seen: races.length, written };
}

trackRun(sql, "streetview-coverage", main);

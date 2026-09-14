/** Tout ce que la page course sait de la route d'une course, en JSON. */
import { writeFileSync } from "node:fs";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { detectLaps } from "../../lib/trace";
import { fetchRoadFeatures, readRoad } from "../../lib/road";
loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
async function main() {
  const [id, out] = process.argv.slice(2);
  const [t] = await sql(`SELECT t.points, t.bounds, t.source, t.distance_m, r.name, r.city, r.race_date::text AS date FROM race_traces t JOIN races r ON r.id = t.race_id WHERE t.race_id = $1::uuid`, [id]);
  const track = t.points as Array<[number, number, number, number]>;
  const laps = detectLaps(track);
  const lap = laps.lap ?? track;
  const lngs = lap.map((p) => p[0]); const lats = lap.map((p) => p[1]);
  const bounds = { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) };
  const road = readRoad(lap, await fetchRoadFeatures(bounds));
  const views = await sql(`SELECT picture_id, along_m, taken_on::text, url, producer, reading FROM road_views WHERE race_id = $1::uuid ORDER BY along_m`, [id]);
  writeFileSync(out, JSON.stringify({ name: t.name, city: t.city, date: t.date, source: t.source, rideM: Number(t.distance_m), lapCount: laps.lapCount, lapM: laps.lapDistanceM, lap, road, views }));
  console.log(`${t.name}: ${laps.lapCount} tours de ${Math.round(laps.lapDistanceM)} m, ${views.length} photos, route ${road ? "lue" : "absente"}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

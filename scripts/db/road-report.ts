/**
 * Ce que la BD TOPO dit de la route sous un tracé.
 *
 *   npx tsx scripts/db/road-report.ts <race id>
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { fetchRoadFeatures, readRoad } from "../../lib/road";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const id = process.argv[2];
  const [t] = await sql(`SELECT points, bounds FROM race_traces WHERE race_id = $1::uuid`, [id]);
  if (!t) throw new Error("Pas de tracé.");
  const points = t.points as Array<[number, number, number, number]>;
  const features = await fetchRoadFeatures(t.bounds as { west: number; south: number; east: number; north: number });
  console.log(`${features.length} tronçons IGN dans la boîte`);
  const report = readRoad(points, features);
  console.log(JSON.stringify(report, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

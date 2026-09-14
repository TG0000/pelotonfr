/**
 * Les photos Panoramax prises sur le tracé d'une course.
 *
 *   npx tsx scripts/db/road-pictures.ts <race id>
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { findRoadPictures } from "../../lib/panoramax";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const [t] = await sql(`SELECT points FROM race_traces WHERE race_id = $1::uuid`, [process.argv[2]]);
  if (!t) throw new Error("Pas de tracé.");
  const pics = await findRoadPictures(t.points as Array<[number, number, number, number]>);
  for (const p of pics) console.log(`${String(Math.round(p.alongM)).padStart(5)} m  ${p.takenOn}  ${p.producer ?? "?"}  ${p.url}`);
  console.log(`${pics.length} photos retenues`);
}
main().catch((e) => { console.error(e); process.exit(1); });

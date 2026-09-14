/** Enregistre les photos d'une course telles que la vision les voit (recadrées vers l'avant). */
import { writeFileSync } from "node:fs";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { findRoadPictures } from "../../lib/panoramax";
import { orientPicture } from "../../lib/road-picture";
loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
async function main() {
  const [id, dir] = process.argv.slice(2);
  const [t] = await sql(`SELECT points FROM race_traces WHERE race_id = $1::uuid`, [id]);
  const pics = await findRoadPictures(t.points as Array<[number, number, number, number]>, 6);
  for (const [i, p] of pics.entries()) {
    const raw = new Uint8Array(await (await fetch(p.url)).arrayBuffer());
    const { bytes, orientation } = await orientPicture(raw, p);
    writeFileSync(`${dir}/crop${i}.jpg`, bytes);
    console.log(i, Math.round(p.alongM), p.takenOn, `fov=${p.fov} az=${p.azimuth} cap=${p.bearing}`, orientation, bytes.length);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/** Remplit la position des photos déjà lues, depuis Panoramax, sans les relire. */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
async function main() {
  const rows = await sql(`SELECT picture_id FROM road_views WHERE lat IS NULL AND picture_id NOT LIKE 'mly:%'`);
  let done = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const ids = rows.slice(i, i + 20).map((r) => String(r.picture_id));
    const res = await fetch(`https://api.panoramax.xyz/api/search?ids=${ids.join(",")}&limit=50`);
    if (!res.ok) continue;
    const data = (await res.json()) as { features?: Array<{ id: string; geometry: { coordinates: [number, number] } }> };
    for (const f of data.features ?? []) {
      await sql(`UPDATE road_views SET lng = $2, lat = $3 WHERE picture_id = $1`, [f.id, f.geometry.coordinates[0], f.geometry.coordinates[1]]);
      done++;
    }
  }
  console.log(`${done} positions remplies sur ${rows.length}.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * Les cyclosportives et randonnées, rangées à part des courses.
 *
 *   npx tsx scripts/db/retype-cyclos.ts [--dry-run]
 *
 * La fédération publie « Le Pic de Nore - Randonnée Cyclosportive » dans le
 * même calendrier que les courses, avec la même discipline « route ». Un
 * coureur qui cherche une course y voit donc des randonnées sans catégorie —
 * et la case « Cyclosportive » des filtres, elle, ne trouvait rien.
 *
 * Le nom seul est lu, et sur des mots sans ambiguïté : « montée », « grimpée »
 * ou « défi » sont souvent de vraies courses de côte, ils restent des courses.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { trackRun } from "../lib/track-run";
import { CYCLO_NAME_SQL } from "../../lib/discipline";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const PATTERN = CYCLO_NAME_SQL;

async function main() {
  const dry = process.argv.includes("--dry-run");

  const rows = (await sql(
    `SELECT id::text, name, race_date::text
       FROM races
      WHERE discipline = 'route' AND name ~* $1
      ORDER BY race_date DESC`,
    [PATTERN]
  )) as Array<{ id: string; name: string; race_date: string }>;

  console.log(`${rows.length} courses « route » qui sont des cyclos ou des randonnées.`);
  for (const r of rows.slice(0, 12)) console.log(`  ${r.race_date}  ${r.name.slice(0, 70)}`);
  if (rows.length > 12) console.log(`  … et ${rows.length - 12} autres`);

  if (dry) return { seen: rows.length, written: 0 };

  await sql(
    `UPDATE races SET discipline = 'cyclosportive'
      WHERE discipline = 'route' AND name ~* $1`,
    [PATTERN]
  );
  console.log(`\n${rows.length} courses retypées en cyclosportive.`);
  return { seen: rows.length, written: rows.length };
}

trackRun(sql, "retype-cyclos", main);

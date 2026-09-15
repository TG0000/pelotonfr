/**
 * Réapparie les engagés restés sans coureur.
 *
 *   npx tsx scripts/db/rematch-entrants.ts [--dry-run]
 *
 * Une page de Coupe de France écrit « Louna (FRA) » : la nationalité entre
 * parenthèses n'est pas un prénom, et 650 engagés d'un cyclo-cross restaient
 * sans coureur. On refait la clé sans les parenthèses et on relie quand un
 * seul coureur du fichier porte ce nom.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

function key(last: string, first: string | null): string {
  return `${last} ${first ?? ""}`
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows = (await sql(`SELECT id, last_name_raw, first_name_raw FROM engagements WHERE rider_id IS NULL`)) as Array<Record<string, unknown>>;
  const wanted = new Map<string, string[]>();
  for (const r of rows) {
    const k = key(String(r.last_name_raw ?? ""), (r.first_name_raw as string) ?? null);
    if (!k) continue;
    const list = wanted.get(k) ?? [];
    list.push(String(r.id));
    wanted.set(k, list);
  }
  const keys = [...wanted.keys()];
  const riders = (await sql(`SELECT id, normalized_name FROM riders WHERE normalized_name = ANY($1::text[])`, [keys])) as Array<Record<string, unknown>>;
  const byName = new Map<string, string[]>();
  for (const r of riders) {
    const list = byName.get(String(r.normalized_name)) ?? [];
    list.push(String(r.id));
    byName.set(String(r.normalized_name), list);
  }
  let linked = 0, ambiguous = 0;
  for (const [k, ids] of wanted) {
    const c = byName.get(k);
    if (!c) continue;
    if (c.length > 1) { ambiguous += ids.length; continue; }
    if (!dry) await sql(`UPDATE engagements SET rider_id = $1::uuid, match_method = 'name_only' WHERE id = ANY($2::uuid[])`, [c[0], ids]);
    linked += ids.length;
  }
  console.log(`${rows.length} sans coureur, ${linked} reliés, ${ambiguous} ambigus (homonymes), ${rows.length - linked - ambiguous} inconnus du fichier.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

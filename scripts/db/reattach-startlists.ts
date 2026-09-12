/**
 * Relire les listes d'engagés rattachées à la mauvaise course.
 *
 *   npx tsx scripts/db/reattach-startlists.ts [--dry-run]
 *
 * « Saint » tout seul faisait correspondre n'importe quelle commune en Saint-
 * quelque-chose : la liste de Saint-Denis-de-Gastines est partie sur Saint-
 * Omer, et quatre-vingt-quatre articles ont connu le même sort. Le
 * rapprochement est corrigé ; ce script retrouve les rattachements dont aucun
 * mot de la commune ne se retrouve dans la course, et relit chaque article —
 * la relecture remplace la copie fautive, où qu'elle soit.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { ingestArticle, parseSlug } from "../scrapers/velopresse-engagements";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const fold = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const EMPTY = new Set(["saint", "sainte", "les", "des", "sur", "sous"]);

async function main() {
  const dry = process.argv.includes("--dry-run");

  const rows = (await sql(
    `SELECT e.source_url, r.name, r.city, count(*) AS n
       FROM engagements e JOIN races r ON r.id = e.race_id
      WHERE e.source_url LIKE '%velopresse%'
      GROUP BY 1, 2, 3`,
    []
  )) as Array<Record<string, string>>;

  const suspects = new Map<string, string>();
  for (const r of rows) {
    const slug = r.source_url.split("/").pop() ?? "";
    const parsed = parseSlug(slug);
    if (!parsed) continue;
    const tokens = fold(parsed.commune)
      .split(" ")
      .map((t) => (t === "st" ? "saint" : t === "ste" ? "sainte" : t))
      .filter((t) => t.length >= 3 && !EMPTY.has(t));
    if (tokens.length === 0) continue;
    const hay = fold(`${r.name} ${r.city}`).replace(/\bst\b/g, "saint");
    if (!tokens.some((t) => hay.includes(t))) {
      suspects.set(r.source_url.replace(/^https?:\/\/[^/]+/, ""), `${parsed.commune} → ${r.name.slice(0, 40)}`);
    }
  }

  console.log(`${rows.length} rattachements, ${suspects.size} suspects.`);
  let fixed = 0;
  let missed = 0;
  for (const [path, label] of suspects) {
    if (dry) {
      console.log(`  ${label}`);
      continue;
    }
    try {
      const result = await ingestArticle(path, false);
      if (result.race) {
        fixed++;
        console.log(`  ✓ ${label.padEnd(60)} → ${result.race.slice(0, 40)}`);
      } else {
        missed++;
        // Sans course sûre, la copie fautive doit quand même partir.
        await sql(`DELETE FROM engagements WHERE source_url = $1`, [
          `https://velopressecollection.ouest-france.fr${path}`,
        ]);
        console.log(`  – ${label.padEnd(60)} ${result.miss ?? "?"} (copie retirée)`);
      }
    } catch (err) {
      console.error(`  ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n${fixed} listes replacées, ${missed} sans course sûre (copies retirées).`);
  return { seen: suspects.size, written: fixed, metadata: { missed } };
}

trackRun(sql, "reattach-startlists", main);

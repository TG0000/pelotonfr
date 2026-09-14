/**
 * Le compteur de catégorie d'un compte, en console.
 *
 *   npx tsx scripts/db/points-report.ts <email>
 */
import { loadEnv } from "../lib/load-env";
import { sql } from "../../lib/db";
import { getRiderSeason } from "../../lib/db/queries/points";
import { assess, downgradeLetter, isLadderCategory } from "../../lib/category-rules";

loadEnv();

async function main() {
  const email = process.argv[2];
  const [u] = await sql(`SELECT id FROM users WHERE email = $1 OR $1 = ANY(alias_emails)`, [email]);
  if (!u) throw new Error("Compte inconnu.");
  const season = await getRiderSeason(u.id as string);
  if (!season) throw new Error("Compte sans coureur relié.");
  if (!isLadderCategory(season.category)) throw new Error(`Catégorie hors échelle : ${season.category}`);
  const a = assess({ category: season.category, gender: season.gender, results: season.results, cpp: season.cpp, cppRank: season.cppRank });
  console.log(`${season.firstName} ${season.lastName} (${season.club ?? "sans club"}), saison ${season.season}, ${season.results.length} départs route`);
  console.log(a.verdict);
  console.log(`  victoires ${a.wins}/${a.winsNeeded}, points ${a.points}/${a.pointsNeeded}, CPP ${a.cpp} (#${a.cppRank}), plancher ${a.cppFloor}, catégorie CPP ${a.cppCategory}, descente ${a.down}`);
  for (const r of a.scoring) console.log(`  ${r.raceDate} ${r.rank}e +${r.points} ${r.raceName.slice(0, 50)}`);
  if (a.down) console.log("\n" + downgradeLetter({ firstName: season.firstName, lastName: season.lastName, uciId: season.uciId, club: season.club, a, season: season.season }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

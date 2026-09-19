/**
 * Ce qui a bougé cette nuit, annoncé aux moteurs le soir même.
 *
 * Tourné à la fin du ramassage nocturne. Il ne renvoie pas tout le site :
 * soumettre chaque soir huit mille adresses inchangées, c'est apprendre au
 * moteur à ne plus écouter. Seules partent les courses créées ou modifiées
 * depuis la veille, et les pages de département qui les listent.
 *
 *   npm run seo:indexnow                # la fenêtre par défaut, 26 heures
 *   npm run seo:indexnow -- --hours=72
 *   npm run seo:indexnow -- --dry-run   # dit ce qu'il enverrait
 */
import { loadEnv, requireEnv } from "../lib/load-env";

loadEnv();

import { createSql } from "../scrapers/utils/db";
import { CANONICAL_SITE_URL } from "../../lib/site-url";
import { submitToIndexNow } from "../../lib/indexnow";

function flag(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const hours = Number(flag("hours") ?? 26);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 60) {
    throw new Error(`--hours doit être un nombre d'heures entre 1 et 1440, reçu « ${flag("hours")} »`);
  }

  const sql = createSql(requireEnv("DATABASE_URL"));

  /* Une course annulée mérite elle aussi d'être relue : sa fiche le dit
     maintenant, et c'est ce qu'un coureur qui la cherche doit trouver. */
  const races = (await sql(
    `SELECT id::text AS id, department_code
       FROM races
      WHERE is_active = true
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE - 30
        AND updated_at >= now() - ($1 || ' hours')::interval
      ORDER BY updated_at DESC
      LIMIT 5000`,
    [String(hours)]
  )) as Array<{ id: string; department_code: string | null }>;

  const urls = new Set<string>();
  const departements = new Set<string>();
  for (const r of races) {
    urls.add(`${CANONICAL_SITE_URL}/course/${r.id}`);
    if (r.department_code) departements.add(r.department_code);
  }
  for (const code of departements) urls.add(`${CANONICAL_SITE_URL}/departement/${code}`);

  /* L'accueil et le calendrier changent dès qu'une seule course change. */
  if (urls.size > 0) {
    urls.add(CANONICAL_SITE_URL);
    urls.add(`${CANONICAL_SITE_URL}/calendrier`);
  }

  const liste = [...urls];
  console.log(
    `${races.length} course${races.length > 1 ? "s" : ""} modifiée${races.length > 1 ? "s" : ""} ` +
      `depuis ${hours} h — ${liste.length} adresse${liste.length > 1 ? "s" : ""} à annoncer ` +
      `(${departements.size} département${departements.size > 1 ? "s" : ""})`
  );

  if (liste.length === 0) return;
  if (dry) {
    for (const u of liste.slice(0, 20)) console.log(`  ${u}`);
    if (liste.length > 20) console.log(`  … et ${liste.length - 20} de plus`);
    return;
  }

  const results = await submitToIndexNow(liste);
  let refuses = 0;
  for (const r of results) {
    console.log(`  ${r.submitted} adresses → HTTP ${r.status}${r.ok ? "" : "  REFUSÉ"}`);
    if (!r.ok) refuses += 1;
  }
  /* Un refus est une vraie panne — clé déplacée, domaine non reconnu — et il
     doit se voir dans le journal du job plutôt que de passer pour un succès. */
  if (refuses > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

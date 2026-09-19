/**
 * Relire la file des listes d'engagés en attente.
 *
 *   npx tsx scripts/db/requeue-startlists.ts [--dry-run]
 *
 * La file gardait le candidat trouvé le soir où la liste n'a pas pu être
 * rattachée, et ce candidat ne se recalculait que pour les articles encore
 * publiés par la presse. Ceux qui ont quitté la page d'accueil du site
 * gardaient donc pour toujours la proposition qu'un rapprochement sans
 * géographie leur avait donnée : le Tour de la Boëme, à La Couronne en
 * Charente, proposé pour la liste du Tour de l'Orne.
 *
 * Ce script relit chaque liste en attente avec le rapprochement d'aujourd'hui.
 * Il ne rattache rien et ne touche à aucun engagement : il ne met à jour que
 * ce que la file propose, et la raison qu'elle affiche.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { findRaces } from "../scrapers/velopresse-engagements";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const dry = process.argv.includes("--dry-run");

  const rows = (await sql(
    `SELECT m.id, m.source_path, m.commune, m.race_date, m.miss_reason,
            m.best_score AS ancien_score, r.name AS ancien_nom
       FROM startlist_misses m
       LEFT JOIN races r ON r.id = m.best_race_id
      WHERE m.resolved_at IS NULL AND m.dismissed_at IS NULL
        AND m.miss_reason IN ('below-threshold', 'no-commune-in-path')
      ORDER BY m.race_date DESC NULLS LAST`,
    []
  )) as Array<Record<string, unknown>>;

  console.log(`${rows.length} listes en attente à relire.\n`);

  let retires = 0;
  let remplaces = 0;
  let gardes = 0;
  let rattachables = 0;

  for (const row of rows) {
    const commune = String(row.commune ?? "");
    const jour = row.race_date ? new Date(String(row.race_date)) : null;
    if (!commune || !jour || !Number.isFinite(jour.getTime())) continue;

    const found = await findRaces(commune, jour);

    /* Une course a pu entrer au calendrier depuis, ou le rapprochement s'est
       corrigé : la liste se rattacherait maintenant toute seule. On ne peut
       pas la rattacher ici — il faudrait relire l'article, que la presse a
       souvent dépublié — mais on met la bonne course en proposition, à un
       clic. C'est ce qui manquait : la file gardait la proposition du soir de
       l'échec, et « 2 jours cyclistes de Machecoul » proposait encore les
       Écoles de Cyclisme des Monts, à Chambéry. */
    const rattachable = found.races.length > 0;
    if (rattachable) {
      rattachables++;
      console.log(
        `  ${commune.slice(0, 30).padEnd(32)} se rattacherait maintenant à ${found.races[0].name.slice(0, 44)}`
      );
    }

    const raison = rattachable
      ? "now-matchable"
      : found.aucuneCommune
        ? "no-commune-in-path"
        : "below-threshold";
    const ancien = row.ancien_nom ? String(row.ancien_nom) : null;
    const nouveau = rattachable ? found.races[0].name : (found.bestName ?? null);
    const nouvelId = rattachable ? found.races[0].id : (found.bestRaceId ?? null);
    const nouveauScore = rattachable ? 1 : (found.bestScore ?? null);
    if (ancien && !nouveau) {
      retires++;
      console.log(
        `  ${commune.slice(0, 30).padEnd(32)} retire « ${ancien.slice(0, 40)} » ` +
          `(${Number(row.ancien_score ?? 0).toFixed(2)})`
      );
    } else if (nouveau && ancien !== nouveau) {
      remplaces++;
      console.log(
        `  ${commune.slice(0, 30).padEnd(32)} « ${(ancien ?? "aucune").slice(0, 28)} » → « ${nouveau.slice(0, 32)} » ` +
          `(${(nouveauScore ?? 0).toFixed(2)})`
      );
    } else {
      gardes++;
    }

    if (!dry) {
      await sql(
        `UPDATE startlist_misses
            SET best_race_id = $2::uuid, best_score = $3::numeric, miss_reason = $4
          WHERE id = $1`,
        [row.id, nouvelId, nouveauScore, raison]
      );
    }
  }

  console.log(
    `\n${retires} propositions retirées, ${remplaces} remplacées, ${gardes} inchangées, ` +
      `${rattachables} listes désormais rattachables.` +
      (dry ? "\n(--dry-run : rien n'a été écrit.)" : "")
  );
  return { seen: rows.length, written: retires + remplaces };
}

trackRun(sql, "requeue-startlists", main);

/**
 * Le garde-fou des données : chaque nuit, il signale les anomalies sans
 * supprimer ni réapparier des données sur une heuristique.
 *
 *   npx tsx scripts/db/data-guard.ts [--dry-run]
 *
 * L'audit du 15 septembre a trouvé neuf formes d'erreur, toutes silencieuses :
 * une sortie rattachée à une course homonyme à 600 km, une édition liée à
 * une commune homonyme d'un autre département, des engagés sans coureur à
 * cause d'un « (FRA) », des abandons comptés comme résultats. Aucune ne
 * levait d'erreur. Ce script les recherche toutes, corrige celles dont la
 * correction est sûre, et inscrit le reste pour la console. Une erreur qui
 * revient est vue le lendemain, pas dans six mois.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { trackRun } from "../lib/track-run";
import { normalizeCategories } from "../../lib/categories";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const dry = process.argv.includes("--dry-run");

type Row = Record<string, unknown>;
async function record(check: string, found: number, fixed: number, sample: Row[], note?: string) {
  console.log(`  ${check.padEnd(34)} trouvé ${String(found).padStart(5)}  corrigé ${String(fixed).padStart(5)}${note ? `  ${note}` : ""}`);
  if (dry) return;
  await sql(
    `INSERT INTO data_issues (check_name, found, fixed, sample, note) VALUES ($1, $2::int, $3::int, $4::jsonb, $5)`,
    [check, found, fixed, JSON.stringify(sample.slice(0, 5)), note ?? null]
  );
}

async function main() {
  let totalFound = 0, totalFixed = 0;
  const tally = (f: number, x: number) => { totalFound += f; totalFixed += x; };

  // 1. Sortie Strava rattachée à une course à plus de 80 km de son départ.
  {
    const bad = (await sql(
      `SELECT a.id, a.name, r.name AS race, round(ST_Distance(a.start_location, r.location) / 1000) AS km
         FROM strava_activities a JOIN races r ON r.id = a.race_id
        WHERE a.start_location IS NOT NULL AND r.location IS NOT NULL
          AND ST_Distance(a.start_location, r.location) > 80000`
    )) as Row[];
    const fixed = 0;

    await record("sortie rattachée trop loin", bad.length, fixed, bad, "à examiner ; conservée");
    tally(bad.length, fixed);
  }

  // 2. Tracé dont le centre est à plus de 50 km du lieu de la course.
  {
    const bad = (await sql(
      `SELECT t.race_id, r.name, t.source, round(ST_Distance(t.centre, r.location) / 1000) AS km
         FROM race_traces t JOIN races r ON r.id = t.race_id
        WHERE t.centre IS NOT NULL AND r.location IS NOT NULL AND ST_Distance(t.centre, r.location) > 50000`
    )) as Row[];
    const fixed = 0;

    await record("tracé loin de la course", bad.length, fixed, bad, "à examiner ; conservé");
    tally(bad.length, fixed);
  }

  // 3. Édition précédente dans un autre département.
  {
    const bad = (await sql(
      `SELECT c.id, c.name, p.name AS prev, c.department_code, p.department_code AS prev_dept
         FROM races c JOIN races p ON p.id = c.previous_race_id
        WHERE c.department_code IS NOT NULL AND p.department_code IS NOT NULL AND c.department_code <> p.department_code`
    )) as Row[];
    const fixed = 0;

    await record("édition d'un autre département", bad.length, fixed, bad, "à examiner ; conservé");
    tally(bad.length, fixed);
  }

  // 4. Engagés sans coureur dont le nom (sans parenthèses) est unique au fichier.
  {
    const rows = (await sql(`SELECT id, last_name_raw, first_name_raw FROM engagements WHERE rider_id IS NULL`)) as Row[];
    const key = (l: string, f: string | null) => `${l} ${f ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    const wanted = new Map<string, string[]>();
    for (const r of rows) {
      const k = key(String(r.last_name_raw ?? ""), (r.first_name_raw as string) ?? null);
      if (k) wanted.set(k, [...(wanted.get(k) ?? []), String(r.id)]);
    }
    const riders = (await sql(`SELECT id, normalized_name FROM riders WHERE normalized_name = ANY($1::text[])`, [[...wanted.keys()]])) as Row[];
    const byName = new Map<string, string[]>();
    for (const r of riders) byName.set(String(r.normalized_name), [...(byName.get(String(r.normalized_name)) ?? []), String(r.id)]);
    const fixed = 0;
    await record("engagés sans coureur", rows.length, fixed, rows.slice(0, 5).map((r) => ({ nom: `${r.last_name_raw} ${r.first_name_raw ?? ""}` })), "rapprochement à examiner");
    tally(rows.length, fixed);
  }

  // 5. Course à venir sans commune ni département (invisible par département).
  {
    const bad = (await sql(
      `SELECT id, name, source_url FROM races WHERE race_date >= CURRENT_DATE AND (city IS NULL OR city ILIKE '%préciser%') AND department_code IS NULL`
    )) as Row[];
    await record("course à venir sans lieu ni département", bad.length, 0, bad, "place-check pose le département depuis le code FFC");
    tally(bad.length, 0);
  }

  // 6. Course route à venir sans catégorie.
  {
    const bad = (await sql(
      `SELECT id, name FROM races WHERE race_date >= CURRENT_DATE AND discipline = 'route' AND cardinality(categories) = 0`
    )) as Row[];
    await record("course route sans catégorie", bad.length, 0, bad, "la fiche FFC ne les donne pas ; à lire ailleurs");
    tally(bad.length, 0);
  }

  // 7. Résultats sans rang (abandons importés) et coureurs en double dans une même course.
  {
    const [a] = (await sql(`SELECT count(*) AS n FROM race_results WHERE rank IS NULL`)) as Row[];
    const [b] = (await sql(`SELECT count(*) AS n FROM (SELECT race_id, rider_id FROM race_results GROUP BY 1, 2 HAVING count(*) > 1) d`)) as Row[];
    await record("résultats sans rang", Number(a.n), 0, [], "exclus des compteurs, gardés comme abandons");
    await record("coureur en double dans une course", Number(b.n), 0, [], "étapes et général : compté une fois");
  }

  // 8. Compteurs d'engagés impossibles.
  {
    const bad = (await sql(`SELECT id, name, entries_engaged, entries_capacity FROM races WHERE entries_engaged > entries_capacity AND entries_capacity > 0`)) as Row[];
    await record("engagés au-delà de la capacité", bad.length, 0, bad);
    tally(bad.length, 0);
  }

  // 9. Prévision aberrante.
  {
    const bad = (await sql(`SELECT race_id, wind_kmh, temp_c FROM race_forecast WHERE wind_kmh > 120 OR temp_c < -25 OR temp_c > 48`)) as Row[];
    const fixed = 0;

    await record("prévision aberrante", bad.length, fixed, bad, "à examiner ; conservée");
    tally(bad.length, fixed);
  }

  // 10. Collecteurs muets : ont vu, n'ont rien écrit, deux nuits de suite.
  {
    const bad = (await sql(
      /* Le garde-fou ne corrige plus rien depuis la v0.2 : il regarde. Il
         écrit donc zéro chaque nuit, et se signalait lui-même comme muet. */
      `SELECT collector, count(*) AS nights FROM collector_runs
        WHERE started_at > now() - interval '2 days' AND items_seen > 0 AND items_written = 0
          AND collector <> 'data-guard'
        GROUP BY collector HAVING count(*) >= 2`
    )) as Row[];
    await record("collecteur muet deux nuits", bad.length, 0, bad, "à regarder");
    tally(bad.length, 0);
  }

  /* 11. Catégories en désaccord avec le titre.

     La fédération écrit la catégorie dans le titre — « BEAUTHEIL - ACCESS 1 »,
     « CASTELJALOUX Cyclo-Cross U15 » — et c'est le seul énoncé qui ne parle que
     de cette course-là. La fiche, elle, décrit toutes les listes de départ du
     jour : la liste féminine est ouverte à tous les niveaux, faute d'effectif,
     et la réunir avec la masculine rendait une course d'Access 1 ouverte aux
     Élites. Le titre fait foi. */
  {
    const rows = (await sql(
      `SELECT id, name, categories FROM races
        WHERE federation_id = 1 AND is_active
          AND COALESCE(race_date_end, race_date) >= CURRENT_DATE`
    )) as Row[];
    const bad: Row[] = [];
    for (const row of rows) {
      const titre = normalizeCategories(row.name as string, "ffc");
      if (titre.length === 0) continue;
      const stored = (row.categories as string[]) ?? [];
      const same =
        stored.length === titre.length && titre.every((c) => stored.includes(c));
      if (!same) bad.push({ id: row.id, name: row.name, base: stored.join(","), titre: titre.join(",") });
    }
    /* Le garde-fou regarde, il ne touche pas : c'est db:recompute-categories,
       juste avant lui dans la nuit, qui réapplique le titre. */
    const fixed = 0;
    await record("catégories contraires au titre", bad.length, fixed, bad, "db:recompute-categories réapplique le titre");
    tally(bad.length, fixed);
  }

  /* 12. Couverture Street View orpheline de son tracé.

     Le résultat appartient à un tracé précis, et la page ne l'affiche que si
     l'empreinte correspond. La colonne d'empreinte est arrivée sans remplir
     les lignes existantes : les quatre couvertures déjà calculées sont
     devenues invisibles du jour au lendemain, sans rien casser ni rien dire. */
  {
    const bad = (await sql(
      `SELECT s.race_id, r.name, s.checked_at::date AS calcule_le
         FROM race_streetview s JOIN race_traces t ON t.race_id = s.race_id
         JOIN races r ON r.id = s.race_id
        WHERE s.trace_hash IS DISTINCT FROM md5(t.points::text)`
    )) as Row[];
    await record("couverture Street View périmée", bad.length, 0, bad, "scrape:streetview la recalcule");
    tally(bad.length, 0);
  }

  console.log(`\n${totalFound} anomalie(s) trouvée(s), ${totalFixed} corrigée(s) ; aucune suppression automatique.`);
  return { seen: totalFound, written: totalFixed };
}

if (dry) void main();
else void trackRun(sql, "data-guard", main);

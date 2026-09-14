/**
 * Relier une course à son édition de l'année d'avant.
 *
 *   npx tsx scripts/db/link-editions.ts [--dry-run]
 *
 * Le rendez-vous (event_id) relie mal les saisons : la fédération change le
 * nom, le numéro d'édition, le club porteur — 78 courses à venir sur 1 811
 * savaient qu'elles avaient eu lieu l'an dernier. Or une course revient au
 * même village, la même semaine, dans la même discipline : c'est ça, une
 * édition. Le nom départage quand plusieurs candidates restent.
 *
 * Ce lien donne « l'an dernier : 84 classés » sur presque toutes les courses,
 * l'affluence avant toute liste d'engagés, et un historique du rendez-vous qui
 * tient d'une saison à l'autre.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const dry = process.argv.includes("--dry-run");

  /* Pour chaque course sans édition précédente connue : la meilleure
     candidate un an plus tôt (± 10 jours), même commune, même fédération,
     même discipline. La similarité du nom (bigrammes) départage, puis
     l'écart de date. */
  const candidates = (await sql(
    `WITH cur AS (
       SELECT r.id, r.name, r.race_date, r.discipline, r.federation_id,
              lower(regexp_replace(coalesce(r.city, ''), '[^a-zA-Z]+', '', 'g')) AS c
         FROM races r
        WHERE r.previous_race_id IS NULL
          AND r.city IS NOT NULL AND r.city NOT ILIKE '%préciser%'
          AND r.race_date >= CURRENT_DATE - 400
     ),
     prev AS (
       SELECT r.id, r.name, r.race_date, r.discipline, r.federation_id, r.finisher_count,
              lower(regexp_replace(coalesce(r.city, ''), '[^a-zA-Z]+', '', 'g')) AS c
         FROM races r
        WHERE r.city IS NOT NULL AND r.city NOT ILIKE '%préciser%'
          AND r.race_date < CURRENT_DATE
     ),
     scored AS (
       SELECT cur.id AS race_id, prev.id AS previous_id,
              abs((cur.race_date - interval '1 year')::date - prev.race_date) AS day_gap,
              similarity(lower(cur.name), lower(prev.name)) AS name_sim,
              row_number() OVER (
                PARTITION BY cur.id
                ORDER BY similarity(lower(cur.name), lower(prev.name)) DESC,
                         abs((cur.race_date - interval '1 year')::date - prev.race_date) ASC
              ) AS rk
         FROM cur JOIN prev
           ON prev.c = cur.c AND prev.c <> ''
          AND prev.federation_id = cur.federation_id
          AND prev.discipline = cur.discipline
          AND prev.id <> cur.id
          AND abs((cur.race_date - interval '1 year')::date - prev.race_date) <= 10
     )
     SELECT race_id::text, previous_id::text, day_gap, round(name_sim::numeric, 2) AS name_sim
       FROM scored WHERE rk = 1`,
    []
  )) as Array<{ race_id: string; previous_id: string; day_gap: number; name_sim: number }>;

  // Une seule course peut être « l'an dernier » d'une seule autre : deux
  // épreuves de la même réunion (Open 1-2-3 et Access) ne doivent pas se
  // disputer la même édition passée — le nom départage.
  const taken = new Set<string>();
  const links = candidates
    .sort((a, b) => b.name_sim - a.name_sim || a.day_gap - b.day_gap)
    .filter((c) => (taken.has(c.previous_id) ? false : (taken.add(c.previous_id), true)));

  console.log(`${candidates.length} courses avec une candidate ; ${links.length} liens retenus.`);
  for (const l of links.slice(0, 5)) console.log("  ", l.race_id.slice(0, 8), "→", l.previous_id.slice(0, 8), `écart ${l.day_gap} j, nom ${l.name_sim}`);
  if (dry) return { seen: candidates.length, written: 0 };

  for (let i = 0; i < links.length; i += 500) {
    const batch = links.slice(i, i + 500);
    await sql(
      `UPDATE races r SET previous_race_id = d.previous_id
         FROM UNNEST($1::uuid[], $2::uuid[]) AS d(race_id, previous_id)
        WHERE r.id = d.race_id`,
      [batch.map((b) => b.race_id), batch.map((b) => b.previous_id)]
    );
  }
  const [k] = (await sql(
    `SELECT count(*) AS n FROM races WHERE previous_race_id IS NOT NULL AND COALESCE(race_date_end, race_date) >= CURRENT_DATE`,
    []
  )) as Array<{ n: string }>;
  console.log(`${links.length} liens écrits ; courses à venir avec une édition précédente : ${k.n}.`);
  return { seen: candidates.length, written: links.length };
}

trackRun(sql, "link-editions", main);

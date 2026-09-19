/**
 * What the organiser says on their own competition page.
 *
 *   npx tsx scripts/scrapers/ffc-briefing.ts [--limit=200] [--force]
 *
 * The nightly calendar scraper reads the list and the map and never opens a
 * competition's page — sixteen hundred detail pages a night is precisely what
 * it was rewritten to stop doing. But those pages carry three things nothing
 * else has: where a dossard is collected, at what time, and now and then the
 * circuit stated outright, "circuit de 7 km à parcourir 11 fois".
 *
 * So it is read separately and selectively, in the order the sector reader uses
 * — a race somebody has in their calendar first, then whoever races soonest.
 * A race's page is read once; organisers fill it in before the event and rarely
 * touch it after.
 *
 * The pickup address is geocoded inside its own commune, which turns "somewhere
 * in Domfront" into "rue du Champ Passais". That point is what the circuit
 * search should be centred on, and it is what a rider needs on the morning.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { fetchHtml, politeDelay } from "./utils/http";
import { parseBriefing, parseStages } from "../../lib/race-briefing";
import { normalizeCategories } from "../../lib/categories";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BAN = "https://api-adresse.data.gouv.fr/search/";

/**
 * Places an address inside the commune that publishes it.
 *
 * "caravane sono" is not an address and will not resolve, which is the right
 * outcome — a bad point is worse than the commune centroid we already hold.
 * The commune is passed as context so "Mairie" lands in the right village.
 */
async function locate(
  place: string,
  city: string,
  departmentCode: string | null
): Promise<{ lat: number; lng: number; score: number } | null> {
  const params = new URLSearchParams({
    q: `${place} ${city}`,
    limit: "1",
    autocomplete: "0",
  });
  if (departmentCode) params.set("postcode", "");
  if (departmentCode) params.set("citycode", "");

  try {
    const res = await fetch(`${BAN}?${params}`, {
      headers: { "User-Agent": "PelotonFR/1.0 (+https://pelotonfr.vercel.app/contact)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { score: number; city?: string; type?: string };
      }>;
    };
    const best = data.features?.[0];
    if (!best) return null;

    // Below this the geocoder is guessing, and it guesses towards big towns.
    if (best.properties.score < 0.5) return null;

    /* It must have found a place *in* the commune, not the commune itself.
       "PODIUM" and "caravane sono" are not addresses; asked to place them the
       geocoder falls back on the village, hands back a confident score, and we
       would store the centroid we already had while calling it precise. */
    if (!["housenumber", "street", "locality"].includes(best.properties.type ?? "")) {
      return null;
    }
    // It must have landed in the commune we asked about.
    const landed = (best.properties.city ?? "").toLowerCase();
    if (landed && !landed.includes(city.toLowerCase().slice(0, 5))) return null;

    return {
      lng: best.geometry.coordinates[0],
      lat: best.geometry.coordinates[1],
      score: best.properties.score,
    };
  } catch {
    return null;
  }
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;
  const force = process.argv.includes("--force");
  /* Les courses par étapes sont une poignée dans un calendrier de seize
     cents : les chercher dans l'ordre normal, c'est lire tout le calendrier
     pour trouver dix fiches. --etapes va les chercher directement. */
  const stagesOnly = process.argv.includes("--etapes");
  /* Le compteur d'engagés bouge chaque jour jusqu'à la clôture : --places
     relit les fiches des dix prochains jours, déjà lues ou non, pour ce
     chiffre-là. */
  const placesOnly = process.argv.includes("--places");
  /* --categories : les fiches des courses sans catégorie, déjà lues ou non.
     La fiche les écrit dans ses critères d'admissibilité, que le lecteur ne
     regardait pas ; 266 courses route à venir n'en avaient aucune.
     --recategories relit en plus celles dont la fiche avait déjà répondu, pour
     réparer ce que l'ancienne lecture — toutes listes de départ confondues —
     avait écrit de travers. */
  const categoriesOnly = process.argv.includes("--categories");
  const reCategories = process.argv.includes("--recategories");

  const races = (await sql(
    `SELECT id, name, city, department_code, source_url,
            race_date, race_date_end
       FROM races
      WHERE federation_id = 1
        AND source_url LIKE '%/calendrier/competition/%'
        AND is_cancelled = false
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
        AND ($2::boolean OR $4::boolean OR $5::boolean OR $6::boolean OR briefing_fetched_at IS NULL)
        AND (NOT $4::boolean OR race_date <= CURRENT_DATE + 10)
        AND (NOT $5::boolean OR $2::boolean OR briefing_fetched_at IS NULL OR briefing_fetched_at < now() - interval '7 days')
        AND (NOT $6::boolean OR briefing_fetched_at IS NOT NULL)
        AND (NOT $3::boolean
             OR (race_date_end > race_date
                 AND NOT EXISTS (SELECT 1 FROM race_stages s
                                  WHERE s.race_id = races.id)))
      ORDER BY EXISTS (SELECT 1 FROM user_favorites f WHERE f.race_id = races.id) DESC,
               race_date ASC
      LIMIT $1::int`,
    [limit, force, stagesOnly, placesOnly, categoriesOnly, reCategories]
  )) as Array<Record<string, unknown>>;

  console.log(`${races.length} fiches à lire.\n`);

  let withCircuit = 0;
  let withPlace = 0;
  let located = 0;
  let withStages = 0;
  let withCategories = 0;
  let withDepartment = 0;

  for (const race of races) {
    try {
      /* En relecture des catégories, une course dont le titre les écrit n'a
         rien à apprendre de sa fiche : on s'épargne la page. */
      if (reCategories && normalizeCategories(race.name as string, "ffc").length > 0) {
        continue;
      }
      const html = await fetchHtml(race.source_url as string);
      const text = cheerio.load(html)("body").text();
      const brief = parseBriefing(text);

      let point: { lat: number; lng: number } | null = null;
      if (brief.bibPickupPlace && race.city) {
        point = await locate(
          brief.bibPickupPlace,
          race.city as string,
          (race.department_code as string) ?? null
        );
      }

      await sql(
        `UPDATE races
            SET bib_pickup_time = $2, bib_pickup_place = $3,
                circuit_m = $4, lap_count = $5,
                entries_close_at = COALESCE($8::timestamp, entries_close_at),
                entries_close_source = CASE WHEN $8::timestamp IS NULL
                                            THEN entries_close_source ELSE 'fiche' END,
                start_location = CASE WHEN $6::float8 IS NULL THEN start_location
                                      ELSE ST_MakePoint($6::float8, $7::float8)::geography END,
                entries_engaged  = CASE WHEN $9::int IS NULL THEN entries_engaged ELSE $10::int - $9::int END,
                entries_capacity = COALESCE($10::int, entries_capacity),
                entries_counted_at = CASE WHEN $9::int IS NULL THEN entries_counted_at ELSE now() END,
                briefing_fetched_at = now()
          WHERE id = $1::uuid`,
        [
          race.id,
          brief.bibPickupTime,
          brief.bibPickupPlace?.slice(0, 160) ?? null,
          brief.circuitM,
          brief.lapCount,
          point?.lng ?? null,
          point?.lat ?? null,
          brief.entriesCloseAt,
          brief.placesLeft,
          brief.placesTotal,
        ]
      );

      /* Ce que la fiche dit et que le nom ne disait pas : les catégories,
         le département en toutes lettres, l'organisateur. Jamais en
         écrasant ce qu'on savait déjà.

         La fédération écrit la catégorie dans le titre — « BEAUTHEIL -
         ACCESS 1 » — et c'est elle qui fait foi : la fiche, elle, décrit
         toutes les listes de départ de la journée, dont la féminine, ouverte
         à tous les niveaux. Quand le titre parle, on ne touche à rien. */
      const fromTitle = normalizeCategories(race.name as string, "ffc");
      if (brief.categories.length > 0 && fromTitle.length === 0) {
        const r = await sql(
          `UPDATE races SET categories = $2::text[] WHERE id = $1::uuid AND categories IS DISTINCT FROM $2::text[] RETURNING id`,
          [race.id, brief.categories]
        );
        if (r.length) withCategories++;
      }
      if (brief.departmentCandidates.length > 0 && !race.department_code) {
        for (const candidate of brief.departmentCandidates) {
          const r = await sql(
            `UPDATE races r SET department_code = d.code, department_name = d.name
               FROM (SELECT DISTINCT department_code AS code, department_name AS name FROM races
                      WHERE department_name IS NOT NULL AND department_code IS NOT NULL) d
              WHERE r.id = $1::uuid AND r.department_code IS NULL
                AND lower(translate(d.name, 'éèêàâîôûç', 'eeeaaiouc')) = lower(translate($2, 'éèêàâîôûç', 'eeeaaiouc'))
              RETURNING r.id`,
            [race.id, candidate]
          );
          if (r.length) { withDepartment++; break; }
        }
      }
      if (brief.organizer) {
        await sql(`UPDATE races SET organizer = $2 WHERE id = $1::uuid AND organizer IS NULL`, [race.id, brief.organizer.slice(0, 120)]);
      }

      /* Une compétition qui dure plusieurs jours est une course par étapes :
         la fédération n'en fait qu'une ligne, alors que le coureur a trois
         parcours à préparer. Les étapes ne vivent que dans le descriptif. */
      if (race.race_date_end) {
        const year = new Date(race.race_date as string).getUTCFullYear();
        const stages = parseStages(text, year);
        /* Cherbourg numérote ses étapes sans jamais dire quel jour : trois
           étapes sur trois jours ne laissent qu'une lecture possible. Quand le
           compte ne tombe pas juste — deux étapes le même jour — on préfère ne
           rien écrire à écrire faux. */
        const span =
          Math.round(
            (new Date(race.race_date_end as string).getTime() -
              new Date(race.race_date as string).getTime()) /
              86_400_000
          ) + 1;
        if (stages.length === span && stages.every((s) => s.day === null)) {
          const day0 = new Date(race.race_date as string);
          for (const stage of stages) {
            const d = new Date(day0);
            d.setUTCDate(d.getUTCDate() + stage.number - 1);
            stage.day = d.toISOString().slice(0, 10);
          }
        }

        if (stages.length > 1) {
          await sql(`DELETE FROM race_stages WHERE race_id = $1::uuid`, [race.id]);
          for (const stage of stages) {
            await sql(
              `INSERT INTO race_stages
                 (race_id, stage_number, stage_date, start_place,
                  finish_place, distance_km, kind)
               VALUES ($1::uuid, $2::int, $3::date, $4, $5, $6::numeric, $7)`,
              [
                race.id,
                stage.number,
                stage.day,
                stage.from?.slice(0, 80) ?? null,
                stage.to?.slice(0, 80) ?? null,
                stage.distanceKm,
                stage.kind,
              ]
            );
          }
          withStages++;
          console.log(
            `  ${String(race.name).slice(0, 38).padEnd(40)} ${stages.length} étapes`
          );
        }
      }

      if (brief.circuitM) withCircuit++;
      if (brief.bibPickupPlace) withPlace++;
      if (point) located++;

      if (brief.circuitM || point) {
        console.log(
          `  ${String(race.name).slice(0, 38).padEnd(40)}` +
            (brief.circuitM
              ? ` ${(brief.circuitM / 1000).toFixed(1)} km${brief.lapCount ? ` × ${brief.lapCount}` : ""}`
              : "") +
            (point ? `  départ situé : ${brief.bibPickupPlace}` : "")
        );
      }
    } catch (err) {
      console.error(
        `  ${String(race.name).slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`
      );
      // Marked read anyway: a page that will not load today will not load
      // tomorrow either, and re-queueing it would starve the ones that would.
      await sql(
        `UPDATE races SET briefing_fetched_at = now() WHERE id = $1::uuid`,
        [race.id]
      );
    }

    await politeDelay(700);
  }

  console.log(
    `\n${withCircuit} circuits annoncés par l'organisateur, ` +
      `${withPlace} lieux de retrait, dont ${located} situés précisément, ` +
      `${withStages} courses par étapes détaillées, ` +
      `${withCategories} catégories posées depuis les critères d'admissibilité, ${withDepartment} départements posés.`
  );

  return {
    seen: races.length,
    written: withPlace,
    metadata: { circuits: withCircuit, located, stages: withStages },
  };
}

async function tracked() {
  const run = await startRun(sql, "ffc-briefing");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

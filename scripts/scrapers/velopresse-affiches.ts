/**
 * Les affiches de course, lues par un modèle de vision.
 *
 *   npx tsx scripts/scrapers/velopresse-affiches.ts [--limit=30] [--dry-run]
 *
 * Les guides techniques ne sortent que pour les grandes épreuves. Les courses
 * ordinaires — la majorité — n'ont qu'une affiche, et l'affiche dit tout :
 * « Circuit de 1.1 km », « Dossards : 13h », « 1er Départ : 14h ».
 *
 * La presse régionale publie une affiche par article « infos de courses ».
 * Le rattachement à une course réutilise le même appariement que les listes
 * d'engagés — même jour, même commune, catégories compatibles — parce qu'écrire
 * une longueur de circuit sur la mauvaise course est pire que ne rien écrire.
 *
 * Demande ANTHROPIC_API_KEY. Sans elle, le collecteur dit ce qu'il aurait lu
 * et n'appelle rien.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { fetchHtml, politeDelay } from "./utils/http";
import { readPoster } from "../../lib/poster";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE = "https://velopressecollection.ouest-france.fr";

/** Le slug porte la commune et la date : « st-ouen-sur-iton-6-septembre-2026 ». */
const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function parseSlug(slug: string): { place: string; date: string } | null {
  const clean = slug
    .replace(/^\d+-/, "")
    .replace(/\.html$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const m = clean.match(
    /^(.*?)-(\d{1,2})-([a-z]+)-(\d{4})-infos/
  );
  if (!m) return null;
  const month = MONTHS[m[3]];
  if (!month) return null;

  return {
    place: m[1].replace(/-/g, " "),
    date: `${m[4]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`,
  };
}

/**
 * La course de ce jour-là dans cette commune.
 *
 * L'adresse de l'article abrège — « st-ouen-sur-iton » là où la fédération
 * écrit « Saint-Ouen-sur-Iton » — et ne dit pas où finit le nom de la commune.
 * On essaie donc plusieurs lectures, de la plus longue à la plus courte, et la
 * date fait le reste : deux courses le même jour dans deux communes qui
 * commencent pareil, ça n'arrive pas.
 */
function placeForms(place: string): string[] {
  const words = place.split(" ").filter(Boolean);
  const expanded = words.map((w) =>
    w === "st" ? "saint" : w === "ste" ? "sainte" : w
  );

  const forms = new Set<string>();
  for (let n = Math.min(4, expanded.length); n >= 1; n--) {
    forms.add(expanded.slice(0, n).join(" "));
    forms.add(words.slice(0, n).join(" "));
  }
  return [...forms];
}

async function findRace(place: string, date: string) {
  for (const form of placeForms(place)) {
    // Les tirets de la fédération contre les espaces de l'adresse.
    const pattern = `${form.replace(/ /g, "%")}%`;
    const rows = await sql(
      `SELECT r.id, r.name, r.city FROM races r
        WHERE r.race_date = $1::date
          AND r.is_cancelled = false
          AND lower(translate(r.city, 'àâäçéèêëîïôöùûüÿ-''', 'aaaceeeeiioouuuy  ')) LIKE $2
        ORDER BY r.name LIMIT 6`,
      [date, pattern]
    );
    if (rows.length > 0) return rows as Array<Record<string, unknown>>;
  }
  return [];
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 30;
  const dryRun =
    process.argv.includes("--dry-run") || !process.env.ANTHROPIC_API_KEY;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "ANTHROPIC_API_KEY absente — les affiches sont repérées et rattachées, " +
        "aucune n'est lue.\n"
    );
  }

  const index = await fetchHtml(`${BASE}/actualites/`);
  const links = [
    ...new Set(
      [...index.matchAll(/href="(\/actualites\/[^"]*infos[^"]*\.html)"/g)].map(
        (m) => m[1]
      )
    ),
  ].slice(0, limit);

  console.log(`${links.length} articles « infos de courses ».\n`);

  let read = 0;
  let written = 0;

  for (const path of links) {
    const slug = path.split("/").pop() ?? "";
    const parsed = parseSlug(slug);
    if (!parsed) continue;

    const races = await findRace(parsed.place, parsed.date);
    if (races.length === 0) {
      console.log(`  ${parsed.place.padEnd(26)} ${parsed.date}  aucune course`);
      await politeDelay(300);
      continue;
    }

    const article = await fetchHtml(`${BASE}${path}`);
    /* L'affiche porte le nom de l'article. Les autres images de la page sont
       les vignettes des articles voisins, rangées sous /thumbnails/. */
    const stem = slug.replace(/^\d+-/, "").replace(/\.html$/, "");
    const image = (article.match(/src="\/media\/[^"]+\.jpg"/g) ?? [])
      .map((m) => m.slice(5, -1))
      .find(
        (src) =>
          !src.includes("/thumbnails/") && src.includes(stem.slice(0, 20))
      );

    if (!image) {
      console.log(`  ${parsed.place.padEnd(26)} ${parsed.date}  pas d'affiche`);
      await politeDelay(300);
      continue;
    }

    if (dryRun) {
      console.log(
        `  ${parsed.place.padEnd(26)} ${parsed.date}  ${races.length} course(s) — affiche repérée`
      );
      await politeDelay(300);
      continue;
    }

    const bytes = new Uint8Array(
      await (await fetch(`${BASE}${image}`)).arrayBuffer()
    );
    const poster = await readPoster(bytes, "image/jpeg");
    read++;

    if (!poster || poster.confidence < 0.6) {
      console.log(
        `  ${parsed.place.padEnd(26)} ${parsed.date}  illisible (${poster?.confidence ?? 0})`
      );
      await politeDelay(600);
      continue;
    }

    /* Écrit sur toutes les courses du jour dans cette commune : une affiche
       annonce la réunion, et le circuit est le même pour toutes ses épreuves.
       Le briefing de la fédération, quand il existe, reste prioritaire. */
    for (const race of races) {
      await sql(
        `UPDATE races
            SET circuit_m        = COALESCE(circuit_m, $2::int),
                lap_count        = COALESCE(lap_count, $3::smallint),
                bib_pickup_time  = COALESCE(bib_pickup_time, $4),
                bib_pickup_place = COALESCE(bib_pickup_place, $5)
          WHERE id = $1::uuid`,
        [
          race.id,
          poster.circuitM,
          poster.lapCount,
          poster.bibPickupTime,
          poster.bibPickupPlace,
        ]
      );
    }
    written++;

    console.log(
      `  ${parsed.place.padEnd(26)} ${parsed.date}  ` +
        (poster.circuitM
          ? `${(poster.circuitM / 1000).toFixed(1)} km${poster.lapCount ? ` × ${poster.lapCount}` : ""}  `
          : "") +
        (poster.bibPickupTime ? `dossards ${poster.bibPickupTime}` : "")
    );

    await politeDelay(800);
  }

  console.log(`\n${read} affiches lues, ${written} exploitées.`);
  return { seen: links.length, written, metadata: { read } };
}

async function tracked() {
  const run = await startRun(sql, "affiches");
  try {
    await run.finish(await main());
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

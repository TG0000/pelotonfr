/**
 * Les guides techniques des courses par étapes.
 *
 *   npx tsx scripts/scrapers/velopresse-guides.ts [--limit=40] [--dry]
 *
 * Un tour ne se prépare pas avec une ligne de calendrier. Le guide technique
 * est le seul document qui dise l'itinéraire kilomètre par kilomètre, les côtes
 * classées et les horaires de passage — et il change à chaque édition, ce qui
 * interdit de recycler le tracé de l'an dernier.
 *
 * Il n'existe que scanné : une image par page, une vingtaine de pages. Ce
 * script les trouve et les range ; les lire est le travail de la vision.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { fetchHtml, politeDelay } from "./utils/http";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE = "https://velopressecollection.ouest-france.fr";

/** Sans accents ni ponctuation : « Tour de l'Orne » et « tour de lorne ». */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    /* « 10èTour » est un mot pour la fédération et deux pour un lecteur. La
       coupure se fait sur la majuscule, avant de tout passer en minuscules :
       sinon on récolte « etour », et « tour » n'existe nulle part dans le nom
       du Tour de l'Orne. */
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les mots d'un nom de course qui identifient l'épreuve.
 *
 * Le nom de la fédération traîne les communes de départ et d'arrivée, la
 * catégorie et le numéro d'édition — « La Ferrière Bochard - Bagnoles de
 * l'Orne - 10èTour de l'Orne masculin - Open 1-2-3 ». Ce qui distingue, c'est
 * « tour orne », pas « open » ni « 10e ».
 */
const NOISE = new Set(
  fold(
    "open access elite u19 u17 u15 masculin feminin femmes hommes course " +
      "cycliste prix grand challenge trophee categorie e eme ème er de du des " +
      "jours jour heures trois deux quatre cinq etapes etape " +
      "la le les l d et en a au aux sur"
  ).split(" ")
);

function keywords(name: string): string[] {
  // « Tour de l'Orne » écrit deux fois ne vaut pas deux mots.
  return [
    ...new Set(
      fold(name)
        .split(" ")
        .filter((w) => w.length > 2 && !NOISE.has(w) && !/^\d+$/.test(w))
    ),
  ];
}

interface Guide {
  url: string;
  title: string;
}

/** Cherche « <mots de la course> guide technique » dans les actualités. */
async function findGuide(name: string, year: number): Promise<Guide | null> {
  const words = keywords(name);
  if (words.length === 0) return null;

  /* Le moteur du site ne filtre pas : il rend les guides récents quelle que
     soit la requête. C'est donc le score qui décide, et la seconde tentative
     ne sert que si le moteur se met un jour à répondre vraiment. */
  const longest = [...words].sort((a, b) => b.length - a.length).slice(0, 2);
  const attempts = [words, longest];

  for (const attempt of attempts) {
    const found = await search(attempt, words, year);
    if (found) return found;
    await politeDelay(500);
  }
  return null;
}

async function search(
  queryWords: string[],
  words: string[],
  year: number
): Promise<Guide | null> {
  const query = encodeURIComponent(`${queryWords.join(" ")} guide technique`);
  const $ = cheerio.load(await fetchHtml(`${BASE}/?s=${query}`));

  let best: Guide | null = null;
  let bestScore = 0;

  $("a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!/guide-technique/.test(href)) return;

    const title = $(a).text().trim().replace(/\s+/g, " ");
    if (title.length < 12) return;

    const folded = fold(title);
    // Le guide de 2025 ne décrit pas la course de 2026.
    if (!folded.includes(String(year))) return;

    /* Le nom de la fédération traîne les communes de départ et d'arrivée —
       « La Ferrière Bochard - Bagnoles de l'Orne - 10èTour de l'Orne » — que le
       titre du guide n'a aucune raison de reprendre. On note donc en
       proportion. Deux mots au moins, et près de la moitié du nom : « tour »
       tout seul ferait passer le Tour de la Manche pour le Tour de l'Orne. */
    const hits = words.filter((w) => folded.includes(w)).length;
    if (hits < 2 || hits / words.length < 0.4) return;

    if (hits > bestScore) {
      bestScore = hits;
      best = { url: href.startsWith("http") ? href : BASE + href, title };
    }
  });

  return best;
}

/**
 * Les pages du guide, en pleine résolution.
 *
 * La page d'article n'affiche que la première en grand et le reste en
 * vignettes, mais les vignettes ont toutes leur original dans /media. On suit
 * la numérotation jusqu'à ce qu'elle s'arrête — la liste des vignettes est
 * parfois plus courte que le document.
 */
async function pagesOf(articleUrl: string): Promise<string[]> {
  const $ = cheerio.load(await fetchHtml(articleUrl));

  let stem: string | null = null;
  $("img").each((_, img) => {
    const src = $(img).attr("src") ?? "";
    const m = src.match(/\/media\/(?:thumbnails\/)?(.+?)-(\d{2})\.jpe?g$/i);
    if (m && !stem) stem = m[1];
  });
  if (!stem) return [];

  /* La numérotation saute : Cherbourg publie 01, 03, 04, 06… Un trou ne veut
     donc pas dire la fin du document — trois d'affilée, si. */
  const pages: string[] = [];
  let misses = 0;
  for (let n = 1; n <= 60 && misses < 3; n++) {
    const url = `${BASE}/media/${stem}-${String(n).padStart(2, "0")}.jpg`;
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (res?.ok) {
      pages.push(url);
      misses = 0;
    } else {
      misses++;
    }
  }
  return pages;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 40;
  const dry = process.argv.includes("--dry");

  /* Seules les courses par étapes ont un guide : une course d'un après-midi
     tient sur son affiche. */
  const races = (await sql(
    `SELECT id::text, name, race_date
       FROM races r
      WHERE race_date >= CURRENT_DATE
        AND is_cancelled = false
        AND (race_date_end > race_date
             OR EXISTS (SELECT 1 FROM race_stages s WHERE s.race_id = r.id))
        AND NOT EXISTS (SELECT 1 FROM race_guides g WHERE g.race_id = r.id)
      ORDER BY race_date
      LIMIT $1::int`,
    [limit]
  )) as Array<Record<string, unknown>>;

  console.log(`${races.length} courses par étapes sans guide.\n`);

  let found = 0;
  let pagesTotal = 0;

  for (const race of races) {
    const year = new Date(race.race_date as string).getUTCFullYear();
    try {
      const guide = await findGuide(race.name as string, year);
      if (!guide) {
        console.log(`  ${String(race.name).slice(0, 44).padEnd(46)} —`);
        await politeDelay(700);
        continue;
      }

      const pages = await pagesOf(guide.url);
      found++;
      pagesTotal += pages.length;
      console.log(
        `  ${String(race.name).slice(0, 44).padEnd(46)} ${pages.length} pages  ${guide.title.slice(0, 40)}`
      );

      if (!dry) {
        await sql(
          `INSERT INTO race_guides (race_id, source_url, title, page_urls)
           VALUES ($1::uuid, $2, $3, $4::jsonb)
           ON CONFLICT (race_id) DO UPDATE
             SET source_url = EXCLUDED.source_url,
                 title = EXCLUDED.title,
                 page_urls = EXCLUDED.page_urls`,
          [race.id, guide.url, guide.title.slice(0, 200), JSON.stringify(pages)]
        );
      }
    } catch (err) {
      console.error(
        `  ${String(race.name).slice(0, 44)}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    await politeDelay(900);
  }

  console.log(`\n${found} guides trouvés, ${pagesTotal} pages à lire.`);
  return { seen: races.length, written: found, metadata: { pages: pagesTotal } };
}

async function tracked() {
  const run = await startRun(sql, "velopresse-guides");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked();

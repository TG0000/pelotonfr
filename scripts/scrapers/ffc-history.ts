/**
 * FFC history discovery.
 *
 *   npx tsx scripts/scrapers/ffc-history.ts [--days=240] [--max-pages=400]
 *
 * The FFC calendar clamps to the present: asking it for a past date range
 * silently returns the current window. Past competitions are only reachable
 * through the results index, which is a plain paginated GET
 * (/resultats/?avant=DD/MM/YYYY&page=N) whose entries carry the competition
 * code, season, discipline, level, date, name and department.
 *
 * This script walks that index backwards and upserts the races it finds, so
 * `ffc-results.ts` can then attach classifications to them. Together they turn
 * a forward-only calendar into an actual archive.
 *
 * Past entries carry no coordinates — only a department — which is fine: they
 * exist for history and rider records, not for "find a race near me". Where a
 * past race belongs to an event we already know, it inherits that event's venue.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { fetchHtml, politeDelay } from "./utils/http";
import { createSql } from "./utils/db";
import { departmentCodeFromName } from "./utils/departments";
import { upsertRaces } from "./utils/upsert-races";
import type { ScrapedRace } from "../../lib/scraper-types";
import type { Discipline, RaceLevel } from "../../lib/constants";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE_URL = "https://competitions.ffc.fr";
const FEDERATION_ID = 1;

const MONTHS: Record<string, number> = {
  janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, "août": 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, "décembre": 12, decembre: 12,
};

const DISCIPLINE_MAP: Record<string, Discipline> = {
  "route": "route",
  "cyclo-cross": "cyclocross",
  "gravel": "gravel",
  "bmx race": "bmx",
  "bmx freestyle": "bmx",
  "pump track": "pump_track",
  "piste endurance": "piste",
  "piste vitesse": "piste",
  "piste": "piste",
  "vtt - cross country": "vtt",
  "vtt - descente": "vtt",
  "vtt - enduro": "vtt",
  "vtt - trial": "vtt",
  "vtt": "vtt",
  "contre-la-montre": "contre_la_montre",
  "cyclosportive": "cyclosportive",
};

const LEVEL_MAP: Record<string, RaceLevel> = {
  international: "international",
  national: "national",
  "régional": "regional",
  regional: "regional",
  "départemental": "local",
  departemental: "local",
  local: "local",
};

function mapDiscipline(label: string): Discipline {
  const key = label.toLowerCase().trim();
  if (DISCIPLINE_MAP[key]) return DISCIPLINE_MAP[key];
  if (key.startsWith("vtt")) return "vtt";
  if (key.startsWith("piste")) return "piste";
  if (key.startsWith("bmx")) return "bmx";
  return "route";
}

/** "31 juillet 2026" → Date at UTC noon. */
function parseFrenchDate(raw: string): Date | null {
  const m = /(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const date = new Date(Date.UTC(Number(m[3]), month - 1, Number(m[1]), 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

/** Categories encoded in the title, mirroring the calendar scraper. */
function extractCategories(title: string): string[] {
  const found = new Set<string>();
  const upper = title.toUpperCase();

  const open = /OPEN\s*([1-3](?:\s*[-/ ]\s*[1-3])*)/.exec(upper);
  if (open) for (const d of open[1].match(/[1-3]/g) ?? []) found.add(`Open${d}`);
  else if (/\bOPEN\b/.test(upper)) ["1", "2", "3"].forEach((d) => found.add(`Open${d}`));

  const access = /ACCESS\s*([1-4](?:\s*[-/ ]\s*[1-4])*)/.exec(upper);
  if (access) for (const d of access[1].match(/[1-4]/g) ?? []) found.add(`Access${d}`);
  else if (/\bACCESS\b/.test(upper)) ["1", "2", "3", "4"].forEach((d) => found.add(`Access${d}`));

  if (/\bELITE?\b/.test(upper)) found.add("Elite");
  for (const m of upper.matchAll(/\bU(\d{2})\b/g)) {
    const n = Number(m[1]);
    if (n === 19) found.add("Juniors");
    else if (n === 17) found.add("Cadets");
    else if (n === 15) found.add("Minimes");
  }
  if (/\bF[EÉ]MININ|DAMES\b/.test(upper)) found.add("Feminines");

  return [...found];
}

interface IndexPage {
  races: ScrapedRace[];
  oldestDate: Date | null;
}

async function fetchIndexPage(
  before: Date | null,
  page: number
): Promise<IndexPage> {
  const params = new URLSearchParams();
  if (before) params.set("avant", formatDate(before));
  if (page > 1) params.set("page", String(page));

  const url = `${BASE_URL}/resultats/${params.toString() ? `?${params}` : ""}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const races: ScrapedRace[] = [];
  let oldestDate: Date | null = null;

  $("a.resultat").each((_, el) => {
    const $a = $(el);
    const code = $a.attr("numero");
    const href = $a.attr("href") ?? "";
    if (!code) return;

    // The index publishes the season alongside the code, and both are needed:
    // the same code serves a different edition each season.
    const season =
      Number($a.attr("saison")) ||
      Number(/\/resultats\/resultat\/(\d{4})\//.exec(href)?.[1]);
    if (!Number.isFinite(season)) return;

    const name = $a.find(".resultat-contenu-nom").text().trim();
    const dateRaw = $a.find(".resultat-contenu-date").text().trim();
    const raceDate = parseFrenchDate(dateRaw);
    if (!name || !raceDate) return;

    if (!oldestDate || raceDate < oldestDate) oldestDate = raceDate;

    const disciplineLabel = $a.find(".resultat-titre-texte-discipline").text().trim();
    const levelLabel = $a.find(".resultat-titre-texte-type").text().trim();
    const departmentName = $a.find(".resultat-contenu-localisation").text().trim();

    races.push({
      externalId: `${season}-${code.toUpperCase()}`,
      competitionCode: code.toUpperCase(),
      season,
      name,
      raceDate,
      departmentName: departmentName || undefined,
      // The index gives a name only; without the code these races drop out of
      // every geographic filter.
      departmentCode: departmentCodeFromName(departmentName),
      discipline: mapDiscipline(disciplineLabel),
      raceType: disciplineLabel || undefined,
      level: LEVEL_MAP[levelLabel.toLowerCase().trim()],
      categories: extractCategories(name),
      gender: /\bDAMES\b|\bF[EÉ]MININ/i.test(name) ? "women" : "mixed",
      sourceUrl: `${BASE_URL}${href.startsWith("/") ? href : `/${href}`}`,
      isCancelled: false,
    });
  });

  return { races, oldestDate };
}

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const pagesArg = process.argv.find((a) => a.startsWith("--max-pages="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 240;
  const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 400;

  const cutoff = new Date();
  cutoff.setUTCHours(12, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  console.log(
    `Walking the FFC results index back to ${formatDate(cutoff)} ` +
      `(max ${maxPages} pages)...\n`
  );

  const byId = new Map<string, ScrapedRace>();

  // Deep pagination gets slower and less reliable the further it goes, so every
  // so often we re-anchor on the oldest date seen and start paging again from
  // page 1. Overlap between chunks is harmless — entries are deduplicated.
  const REANCHOR_EVERY = 25;

  let anchor: Date | null = null;
  let page = 1;
  let pagesFetched = 0;
  let reachedCutoff = false;
  let emptyPages = 0;
  /**
   * Re-anchoring deliberately re-reads the boundary date, so the first page or
   * two of a new chunk are expected to be entirely familiar. Only a sustained
   * run of nothing-new means the index has actually run dry.
   */
  let noFreshStreak = 0;

  while (pagesFetched < maxPages && !reachedCutoff) {
    let result: IndexPage;
    try {
      result = await fetchIndexPage(anchor, page);
      pagesFetched++;
    } catch (err) {
      console.error(
        `  page ${page} failed: ${err instanceof Error ? err.message : String(err)}`
      );
      break;
    }

    if (result.races.length === 0) {
      emptyPages++;
      // The index occasionally returns a short page; only stop after two.
      if (emptyPages >= 2) break;
    } else {
      emptyPages = 0;
    }

    let fresh = 0;
    for (const race of result.races) {
      if (race.raceDate < cutoff) {
        reachedCutoff = true;
        continue;
      }
      if (!byId.has(race.externalId)) {
        byId.set(race.externalId, race);
        fresh++;
      }
    }

    if (pagesFetched % 25 === 0 || reachedCutoff) {
      const oldest = result.oldestDate ? formatDate(result.oldestDate) : "?";
      console.log(
        `  ${pagesFetched} pages: ${byId.size} races collected (oldest ${oldest})`
      );
    }

    if (fresh === 0 && result.races.length > 0) noFreshStreak++;
    else noFreshStreak = 0;

    if (noFreshStreak >= 8) break;

    if (page >= REANCHOR_EVERY && result.oldestDate) {
      const next = result.oldestDate;
      // If re-anchoring would not move us backwards, the index has run out.
      if (anchor && next >= anchor) break;
      anchor = next;
      page = 1;
      await politeDelay(250);
      continue;
    }

    page++;
    await politeDelay(250);
  }

  const races = [...byId.values()];
  console.log(`\nDiscovered ${races.length} past races. Upserting...`);

  const stats = await upsertRaces(races, FEDERATION_ID, sql);
  console.log(
    `  db: +${stats.inserted} new, ~${stats.updated} updated, =${stats.skipped} unchanged`
  );

  const [summary] = await sql(
    `SELECT COUNT(*) FILTER (WHERE competition_code IS NOT NULL
                             AND COALESCE(race_date_end, race_date) < CURRENT_DATE) AS past_with_code
       FROM races WHERE federation_id = $1::smallint`,
    [FEDERATION_ID]
  );
  console.log(
    `\n${summary.past_with_code} past FFC races now carry a competition code ` +
      `and are ready for results ingestion.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

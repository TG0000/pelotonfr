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
 *
 * HOW FAR BACK THIS CAN REACH
 *
 * Not as far as one would like. The index serves roughly the current season and
 * the one before it, and returns an empty page for anything older — measured by
 * bisection: `avant=01/05/2025` still lists competitions, `avant=15/04/2025`
 * lists none. Asking for 2021 does not fail, it simply walks empty pages for
 * hours, which is why the horizon is asserted here rather than discovered again
 * by whoever tries next.
 *
 * Reaching the 2021 category reform therefore needs a different route — a
 * rider's own palmarès page yields the competition codes of races they rode,
 * and those pages are not bounded the way this index is.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { fetchHtml, politeDelay } from "./utils/http";
import { createSql } from "./utils/db";
import { departmentCodeFromName } from "./utils/departments";
import { upsertRaces } from "./utils/upsert-races";
import { normalizeCategories } from "../../lib/categories";
import type { ScrapedRace } from "../../lib/scraper-types";
import type { Discipline, RaceLevel } from "../../lib/constants";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE_URL = "https://competitions.ffc.fr";
const FEDERATION_ID = 1;

/**
 * The oldest date the results index still answers for, established by
 * bisection in August 2026. It moves forward as seasons roll off, so it is
 * checked rather than trusted: walking past it costs hours and yields nothing.
 */
const INDEX_HORIZON = "2025-05-01";

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
/**
 * The categories a race title states.
 *
 * A thin wrapper on the one vocabulary, in `lib/categories.ts`. Each scraper
 * used to carry its own copy, and the copies drifted: these two wrote "Open2"
 * and "Cadets" where the rest of the product writes "open2" and "u17". Postgres
 * array overlap is case-sensitive, so a 2025 edition never matched its 2026 one
 * and the race page fell back to the regional field with a previous edition
 * sitting in the table. Three thousand races carried the divergent spelling.
 *
 * There is one home for this vocabulary. Anything else is a copy waiting to
 * drift again.
 */
function extractCategories(title: string): string[] {
  return normalizeCategories(title);
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
  const fromArg = process.argv.find((a) => a.startsWith("--from="));
  const untilArg = process.argv.find((a) => a.startsWith("--until="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 240;
  const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 400;

  /**
   * The window to walk, newest bound first.
   *
   * `--days` walks back from today, which is what the nightly job wants. An
   * explicit `--from`/`--until` pair makes a slice that does not start at
   * today, so several seasons can be reached at once instead of one long walk
   * that has to reach 2021 through everything in between.
   */
  const parseDay = (value: string): Date => {
    const d = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      console.error(`Unreadable date "${value}" — expected YYYY-MM-DD.`);
      process.exit(1);
    }
    return d;
  };

  const start = fromArg ? parseDay(fromArg.split("=")[1]) : null;

  const cutoff = untilArg
    ? parseDay(untilArg.split("=")[1])
    : (() => {
        const d = start ? new Date(start) : new Date();
        d.setUTCHours(12, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - days);
        return d;
      })();

  const horizon = new Date(`${INDEX_HORIZON}T12:00:00Z`);
  if (cutoff < horizon) {
    console.warn(
      `The results index does not reach ${formatDate(cutoff)}. It serves back ` +
        `to about ${formatDate(horizon)} and returns empty pages before that, ` +
        `so the walk stops there rather than spending hours on nothing.\n` +
        `Deeper history needs the per-rider palmarès route, not this index.\n`
    );
    cutoff.setTime(horizon.getTime());
  }

  console.log(
    `Walking the FFC results index ` +
      `${start ? `from ${formatDate(start)} ` : ""}` +
      `back to ${formatDate(cutoff)} (max ${maxPages} pages)...\n`
  );

  const byId = new Map<string, ScrapedRace>();

  // Deep pagination gets slower and less reliable the further it goes, so every
  // so often we re-anchor on the oldest date seen and start paging again from
  // page 1. Overlap between chunks is harmless — entries are deduplicated.
  const REANCHOR_EVERY = 25;

  // A slice that starts in the past anchors there rather than at today.
  let anchor: Date | null = start;
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

    // Long enough to sit out a single busy date. A Sunday in October fills more
    // than twenty pages on its own, and a chunk that re-anchors onto that date
    // re-reads every one of them before it sees anything new. At eight pages the
    // walk called that "the index has run dry" and stopped five months short of
    // the horizon it was asked for.
    if (noFreshStreak >= 40) break;

    if (page >= REANCHOR_EVERY && result.oldestDate) {
      const next = result.oldestDate;
      // Re-anchoring onto the same date would restart the same chunk. That is
      // not the end of the index, only a date with more entries than a chunk
      // holds — so keep paging rather than stopping.
      if (!anchor || next < anchor) {
        anchor = next;
        page = 1;
        noFreshStreak = 0;
        await politeDelay(250);
        continue;
      }
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

  // What the index offered against what we kept. A walk that finds nothing new
  // is a legitimate outcome, but it should say so rather than report silence.
  return {
    seen: byId.size,
    // Unchanged rows are still held correctly — counting only writes reported
    // a complete archive as a total loss.
    written: stats.inserted + stats.updated + stats.skipped,
  };
}

/**
 * Wrapped so the run is recorded whichever way it ends — including the way
 * that used to be invisible, where it simply never started.
 */
async function tracked() {
  const run = await startRun(sql, "ffc-history");
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

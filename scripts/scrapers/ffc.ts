/**
 * FFC scraper — competitions.ffc.fr
 *
 * The calendar page renders the same set of competitions twice:
 *
 *   1. A list view, one <a class="organisation-titre"> per competition, holding
 *      discipline, calendar level, date (or date range), department, title and
 *      an explicit "ANNULÉ" flag.
 *   2. A map view, one <div class="map-marker" lat lng href> per competition,
 *      holding municipality-level coordinates published by the FFC itself.
 *
 * Both reference the same competition URL, so joining them on the competition
 * code yields a fully-populated race — including coordinates — without ever
 * opening a detail page.
 *
 * This replaces the previous approach, which fetched one detail page per race
 * (~1600 requests, frequent timeouts) only to read a department name out of a
 * meta description. Coverage of the join is ~97%; the remainder keeps its
 * department and is resolved later by the venue pipeline.
 */

import * as cheerio from "cheerio";
import { normalizeCategories } from "../../lib/categories";
import type {
  ScrapedRace,
  ScraperResult,
  ScraperError,
} from "../../lib/scraper-types";
import type { Discipline, RaceLevel } from "../../lib/constants";
import { fetchHtml, politeDelay } from "./utils/http";

const BASE_URL = "https://competitions.ffc.fr";
const FEDERATION_ID = 1;

/** The calendar accepts at most a 14-day window per request. */
const WINDOW_DAYS = 14;

/** How far ahead to scrape. */
const MONTHS_AHEAD = 12;

export interface FfcScrapeOptions {
  /**
   * Days of past calendar to also collect. Past races carry the competition
   * code that their results page is addressed by, so backfilling history is
   * what makes results — and therefore rider records — available at all.
   */
  backfillDays?: number;
  monthsAhead?: number;
}

/**
 * Maps the FFC discipline label to a coarse family. The original label is kept
 * in `raceType`, so "VTT - Enduro" and "Piste Vitesse" are not flattened away.
 */
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
  // Fall back to the family prefix, e.g. an unseen "VTT - Marathon".
  for (const [prefix, value] of Object.entries(DISCIPLINE_MAP)) {
    if (key.startsWith(prefix.split(" - ")[0]) && prefix.includes(" - ")) {
      return value;
    }
  }
  return "route";
}

function mapLevel(label: string): RaceLevel | undefined {
  return LEVEL_MAP[label.toLowerCase().trim()];
}

/** "14/09/2026" → Date at UTC noon (avoids timezone date shifts). */
function parseSlashDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The longest span a single race can plausibly cover.
 *
 * The federation occasionally publishes a range that spans a whole season —
 * "Du 01/05/2026 au 29/08/2026" for a one-afternoon women's U17 event — which
 * is one competition code covering several dates rather than a stage race. Kept
 * as a range, such an entry stays "in progress" for months: it heads every
 * upcoming list, drags the calendar back to May, and paints itself across the
 * grid. The real ones are short — the Tour de l'Avenir runs seven days.
 */
const MAX_RACE_SPAN_DAYS = 10;

/**
 * Parses "Le 01/09/2026" and "Du 04/09/2026 au 06/09/2026".
 */
function parseDateCell(raw: string): { start: Date; end?: Date } | null {
  const text = raw.replace(/\s+/g, " ").trim();

  const range = /^Du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})$/i.exec(text);
  if (range) {
    const start = parseSlashDate(range[1]);
    const end = parseSlashDate(range[2]);
    if (!start) return null;
    if (!end || end <= start) return { start };
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
    // Beyond the plausible span, trust the opening date and drop the rest.
    return spanDays <= MAX_RACE_SPAN_DAYS ? { start, end } : { start };
  }

  const single = /^Le\s+(\d{2}\/\d{2}\/\d{4})$/i.exec(text);
  if (single) {
    const start = parseSlashDate(single[1]);
    return start ? { start } : null;
  }

  // Unexpected wording — salvage the first date present.
  const loose = /(\d{2}\/\d{2}\/\d{4})/.exec(text);
  if (loose) {
    const start = parseSlashDate(loose[1]);
    if (start) return { start };
  }
  return null;
}

/**
 * Extracts (year, code) from a competition URL.
 *
 * The leading "C" some codes carry is part of the identifier, not a formatting
 * quirk: 4103187002 and C4103187002 are two different competitions, held a year
 * apart. Stripping it merged distinct races while doing nothing for the join
 * rate between the list and map views, which is 96.6% either way.
 */
function parseCompetitionRef(
  href: string
): { year: string; code: string; key: string } | null {
  const m = /\/calendrier\/competition\/(\d{4})\/([^/"?#]+)/.exec(href);
  if (!m) return null;
  const year = m[1];
  const code = m[2].toUpperCase();
  return { year, code, key: `${year}:${code}` };
}

/** FFC writes coordinates with a comma decimal separator. */
function parseCoordinate(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Categories are encoded in the title, e.g.
 *   "Alençon - Open 1-2-3 - Access 1-2-3-4"  → Open1..3, Access1..4
 *   "GP de Strasbourg M3 (U15 G+F)"          → U15
 */
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

/** Infers gender when the title says so explicitly. */
function inferGender(title: string): "men" | "women" | "mixed" {
  const upper = title.toUpperCase();
  if (/\bDAMES\b|\bF[EÉ]MININ/.test(upper) && !/H\/F|G\+F|\bMIXTE\b/.test(upper)) {
    return "women";
  }
  return "mixed";
}

function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

interface Window {
  from: Date;
  to: Date;
}

/** Builds consecutive 14-day windows covering the scraping horizon. */
function buildWindows(monthsAhead: number, backfillDays = 0): Window[] {
  const windows: Window[] = [];
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  if (backfillDays > 0) start.setUTCDate(start.getUTCDate() - backfillDays);

  const horizon = new Date();
  horizon.setUTCHours(12, 0, 0, 0);
  horizon.setUTCMonth(horizon.getUTCMonth() + monthsAhead);

  let cursor = new Date(start);
  while (cursor < horizon) {
    const to = new Date(cursor);
    to.setUTCDate(to.getUTCDate() + WINDOW_DAYS - 1);
    windows.push({ from: new Date(cursor), to: to > horizon ? horizon : to });
    cursor = new Date(to);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

interface MarkerData {
  lat: number;
  lng: number;
}

/** Scrapes one calendar window and returns the races it contains. */
async function scrapeWindow(
  window: Window,
  errors: ScraperError[]
): Promise<ScrapedRace[]> {
  const url =
    `${BASE_URL}/calendrier/calendrier.aspx` +
    `?debut=${encodeURIComponent(formatDate(window.from))}` +
    `&fin=${encodeURIComponent(formatDate(window.to))}` +
    `&discipline=&categorie=&departement=&type=&carte=0`;

  const data = await fetchHtml(url);
  const $ = cheerio.load(data);

  // Pass 1 — coordinates, keyed by competition.
  const markers = new Map<string, MarkerData>();
  $("div.map-marker").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (!href) return;
    const ref = parseCompetitionRef(href);
    if (!ref) return;
    const lat = parseCoordinate($el.attr("lat") ?? "");
    const lng = parseCoordinate($el.attr("lng") ?? "");
    if (lat === null || lng === null) return;
    // Guard against obviously wrong points (metropolitan France + DOM range).
    if (lat < -25 || lat > 52 || lng < -65 || lng > 56) return;
    markers.set(ref.key, { lat, lng });
  });

  // Pass 2 — the list view carries every descriptive field.
  const races: ScrapedRace[] = [];
  const seen = new Set<string>();

  $("a.organisation-titre").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;

    const ref = parseCompetitionRef(href);
    if (!ref || seen.has(ref.key)) return;

    const title = $a.find(".organisation-titre-libelle").text().trim();
    const dateRaw = $a.find(".organisation-titre-jours").text().trim();
    const parsedDate = parseDateCell(dateRaw);
    if (!title || !parsedDate) {
      errors.push({
        url: `${BASE_URL}${href}`,
        message: !title ? "missing title" : `unparsable date: ${dateRaw}`,
      });
      return;
    }

    seen.add(ref.key);

    const disciplineLabel = $a
      .find(".organisation-titre-discipline")
      .text()
      .trim();
    const levelLabel = $a
      .find(".organisation-titre-calendrierType")
      .text()
      .trim();
    const departmentName = $a
      .find(".organisation-titre-localisation")
      .text()
      .trim();

    // The list view flags cancellations explicitly, which is far more reliable
    // than searching the page text for "annulé" (that used to match "annuel").
    const isCancelled = $a.find(".organisation-titre-annule").length > 0;

    const marker = markers.get(ref.key);

    races.push({
      // The season is part of the identity: the FFC reuses a competition code
      // from one season to the next, and keying on the code alone merged the
      // editions into a single row.
      externalId: `${ref.year}-${ref.code}`,
      competitionCode: ref.code,
      season: Number(ref.year),
      name: title,
      raceDate: parsedDate.start,
      raceDateEnd: parsedDate.end,
      lat: marker?.lat,
      lng: marker?.lng,
      departmentName: departmentName || undefined,
      discipline: mapDiscipline(disciplineLabel),
      raceType: disciplineLabel || undefined,
      level: mapLevel(levelLabel),
      categories: extractCategories(title),
      gender: inferGender(title),
      sourceUrl: `${BASE_URL}${href.startsWith("/") ? href : `/${href}`}`,
      isCancelled,
    });
  });

  return races;
}

export async function scrapeFFC(
  options: FfcScrapeOptions = {}
): Promise<ScraperResult> {
  const monthsAhead = options.monthsAhead ?? MONTHS_AHEAD;
  const backfillDays = options.backfillDays ?? 0;

  const start = Date.now();
  const errors: ScraperError[] = [];
  const byKey = new Map<string, ScrapedRace>();

  const windows = buildWindows(monthsAhead, backfillDays);
  console.log(
    `FFC: scanning ${windows.length} windows of ${WINDOW_DAYS} days ` +
      `(${monthsAhead} months ahead` +
      (backfillDays ? `, ${backfillDays} days back` : "") +
      `)...`
  );

  let withCoords = 0;

  for (const window of windows) {
    const label = `${formatDate(window.from)}→${formatDate(window.to)}`;
    try {
      const races = await scrapeWindow(window, errors);
      for (const race of races) {
        // Windows are disjoint, but a race spanning several of them is listed in
        // each one it overlaps. The competition code is compared verbatim — its
        // leading "C" is part of the identifier, not noise.
        const key = race.externalId.toUpperCase();
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, race);
          if (race.lat != null) withCoords++;
        } else if (existing.lat == null && race.lat != null) {
          // A later window may carry the coordinates the first one lacked.
          existing.lat = race.lat;
          existing.lng = race.lng;
          withCoords++;
        }
      }
      console.log(`  ${label}: ${races.length} races`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ${label}: failed — ${message}`);
      errors.push({ url: label, message });
    }
    await politeDelay(500);
  }

  const races = [...byKey.values()];
  const coordPct = races.length
    ? Math.round((withCoords / races.length) * 100)
    : 0;
  console.log(
    `FFC: ${races.length} unique races, ${withCoords} with coordinates (${coordPct}%)`
  );

  return {
    federationId: FEDERATION_ID,
    races,
    errors,
    durationMs: Date.now() - start,
    // Only claim coverage when the run actually completed; a partly-failed
    // scrape must not be used to retire races it simply never saw.
    coverageDays: errors.length === 0 ? monthsAhead * 30 : undefined,
  };
}

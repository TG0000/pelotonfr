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
import type {
  ScrapedRace,
  ScraperResult,
  ScraperError,
} from "../../lib/scraper-types";
import type { Discipline, RaceLevel } from "../../lib/constants";
import { httpClient, politeDelay } from "./utils/http";

const BASE_URL = "https://competitions.ffc.fr";
const FEDERATION_ID = 1;

/** The calendar accepts at most a 14-day window per request. */
const WINDOW_DAYS = 14;

/** How far ahead to scrape. */
const MONTHS_AHEAD = 12;

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
 * Parses "Le 01/09/2026" and "Du 04/09/2026 au 06/09/2026".
 */
function parseDateCell(raw: string): { start: Date; end?: Date } | null {
  const text = raw.replace(/\s+/g, " ").trim();

  const range = /^Du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})$/i.exec(text);
  if (range) {
    const start = parseSlashDate(range[1]);
    const end = parseSlashDate(range[2]);
    if (!start) return null;
    return end && end > start ? { start, end } : { start };
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
 * Extracts (year, code) from a competition URL. The code is sometimes prefixed
 * with "C" in the list view but not in every map marker, so it is normalised.
 */
function parseCompetitionRef(
  href: string
): { year: string; code: string; key: string } | null {
  const m = /\/calendrier\/competition\/(\d{4})\/([^/"?#]+)/.exec(href);
  if (!m) return null;
  const year = m[1];
  const code = m[2].toUpperCase();
  const normalized = code.replace(/^C/, "");
  return { year, code, key: `${year}:${normalized}` };
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
function extractCategories(title: string): string[] {
  const found = new Set<string>();
  const upper = title.toUpperCase();

  // "OPEN 1-2-3" / "OPEN 1 2 3" / "OPEN123"
  const openMatch = /OPEN\s*([1-3](?:\s*[-/ ]\s*[1-3])*)/.exec(upper);
  if (openMatch) {
    for (const digit of openMatch[1].match(/[1-3]/g) ?? []) {
      found.add(`Open${digit}`);
    }
  } else if (/\bOPEN\b/.test(upper)) {
    found.add("Open1");
    found.add("Open2");
    found.add("Open3");
  }

  const accessMatch = /ACCESS\s*([1-4](?:\s*[-/ ]\s*[1-4])*)/.exec(upper);
  if (accessMatch) {
    for (const digit of accessMatch[1].match(/[1-4]/g) ?? []) {
      found.add(`Access${digit}`);
    }
  } else if (/\bACCESS\b/.test(upper)) {
    for (const digit of ["1", "2", "3", "4"]) found.add(`Access${digit}`);
  }

  if (/\bELITE?\b/.test(upper)) found.add("Elite");

  // Youth categories are published as U-numbers.
  for (const m of upper.matchAll(/\bU(\d{2})\b/g)) {
    const n = Number(m[1]);
    if (n === 19) found.add("Juniors");
    else if (n === 17) found.add("Cadets");
    else if (n === 15) found.add("Minimes");
  }

  if (/\bF[EÉ]MININ|DAMES\b/.test(upper)) found.add("Feminines");

  return [...found];
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
function buildWindows(monthsAhead: number): Window[] {
  const windows: Window[] = [];
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);

  const horizon = new Date(start);
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

  const { data } = await httpClient.get<string>(url);
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
      externalId: ref.code,
      competitionCode: ref.code,
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

export async function scrapeFFC(): Promise<ScraperResult> {
  const start = Date.now();
  const errors: ScraperError[] = [];
  const byKey = new Map<string, ScrapedRace>();

  const windows = buildWindows(MONTHS_AHEAD);
  console.log(
    `FFC: scanning ${windows.length} windows of ${WINDOW_DAYS} days ` +
      `(${MONTHS_AHEAD} months ahead)...`
  );

  let withCoords = 0;

  for (const window of windows) {
    const label = `${formatDate(window.from)}→${formatDate(window.to)}`;
    try {
      const races = await scrapeWindow(window, errors);
      for (const race of races) {
        // Windows are disjoint, but a race spanning several of them is listed in
        // each one it overlaps — and the FFC writes the same competition code
        // with or without its "C" prefix depending on the view. Normalise before
        // deduplicating so those never become two rows.
        const key = race.externalId.toUpperCase().replace(/^C/, "");
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
  };
}

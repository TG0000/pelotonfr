/**
 * Shared parser for cyclisme-amateur.com, which publishes both the FSGT and
 * UFOLEP calendars with an identical table layout.
 *
 * Notes on this source, learned the hard way:
 *
 *  - It advertises `charset=iso-8859-1` but actually serves UTF-8. Trusting the
 *    header is what turned "GENÉTOUZE" into "GENÃ©TOUZE" (and then into "�" once
 *    it reached the database). `fetchHtml` decodes defensively.
 *
 *  - The `annee` query parameter is ignored: every year returns the same rolling
 *    calendar. The previous scraper looped over two years and simply collected
 *    each race twice.
 *
 *  - It is a *town* calendar: a race has no formal name, only the commune that
 *    hosts it. The anchor text is truncated (~30 chars) but the enclosing cell's
 *    `title` attribute holds the clean, complete commune name, so that is what
 *    we trust. Anything the anchor adds beyond the town is kept as a note.
 *
 *  - No coordinates are published, so races come out with a city name only and
 *    the venue pipeline forward-geocodes them.
 */

import * as cheerio from "cheerio";
import type {
  ScrapedRace,
  ScraperResult,
  ScraperError,
} from "../../../lib/scraper-types";
import type { Discipline } from "../../../lib/constants";
import { fetchHtml, politeDelay } from "./http";

const BASE_URL = "http://www.cyclisme-amateur.com";

/** Abbreviated French months as printed in the date cell ("Ven 28 Aout."). */
const MONTHS: Record<string, number> = {
  janv: 1, jan: 1,
  fevr: 2, fev: 2,
  mars: 3, mar: 3,
  avri: 4, avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  aout: 8,
  sept: 9, sep: 9,
  octo: 10, oct: 10,
  nove: 11, nov: 11,
  dece: 12, dec: 12,
};

const DISCIPLINE_PATTERNS: Array<[RegExp, Discipline]> = [
  [/\bvtt\b|\bv\.t\.t\b/i, "vtt"],
  [/cyclo\s*-?\s*cross|cyclocross/i, "cyclocross"],
  [/gravel/i, "gravel"],
  [/\bbmx\b/i, "bmx"],
  [/\bpiste\b/i, "piste"],
  [/contre[\s-]*la[\s-]*montre|\bclm\b/i, "contre_la_montre"],
  [/par\s+[ée]tapes/i, "course_par_etapes"],
  [/cyclosport|randonn[ée]e|rando\b/i, "cyclosportive"],
  [/\broute\b/i, "route"],
];

/** French words that stay lowercase inside a place name. */
const LOWER_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et",
  "aux", "au", "lès", "les", "sainte", "saint",
]);

function stripAccentsLower(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * "LA  GENÉTOUZE" → "La Genétouze", "SAINT-JEAN-D'ANGÉLY" → "Saint-Jean-d'Angély".
 * The source writes commune names in caps, which reads badly in a UI.
 */
export function titleCasePlace(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return "";

  const capitalize = (word: string) =>
    word.charAt(0).toUpperCase() + word.slice(1);

  return cleaned
    .split(" ")
    .map((word, wordIndex) =>
      word
        .split("-")
        .map((part, partIndex) => {
          if (!part) return part;
          // Elisions: d'angély → d'Angély
          const elision = /^([dl])'(.+)$/.exec(part);
          if (elision) return `${elision[1]}'${capitalize(elision[2])}`;
          const isFirst = wordIndex === 0 && partIndex === 0;
          if (!isFirst && LOWER_WORDS.has(part)) return part;
          return capitalize(part);
        })
        .join("-")
    )
    .join(" ");
}

function parseDateCell(raw: string, referenceYear: number): Date | null {
  // "Ven 28 Aout." / "Dim 12 Mars"
  const m = /(\d{1,2})\s+([A-Za-zÀ-ÿ]+)/.exec(raw.trim());
  if (!m) return null;

  const day = Number(m[1]);
  const monthKey = stripAccentsLower(m[2]).replace(/\.$/, "").slice(0, 4);
  const month =
    MONTHS[monthKey] ?? MONTHS[monthKey.slice(0, 3)] ?? undefined;
  if (!month || day < 1 || day > 31) return null;

  // The calendar is a rolling window with no year printed. A month more than
  // three months behind us belongs to next year.
  const now = new Date();
  let year = referenceYear;
  const currentMonth = now.getUTCMonth() + 1;
  if (month < currentMonth - 3) year = referenceYear + 1;

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectDiscipline(...texts: string[]): Discipline {
  const haystack = texts.join(" ");
  for (const [pattern, discipline] of DISCIPLINE_PATTERNS) {
    if (pattern.test(haystack)) return discipline;
  }
  return "route";
}

/** "Course de vélo FSGT : ARGENTAN " → "ARGENTAN" */
function cityFromTitle(title: string): string | null {
  const idx = title.lastIndexOf(":");
  if (idx === -1) return null;
  const city = title.slice(idx + 1).trim();
  return city || null;
}

/**
 * Separates the commune from the start-location detail the source appends.
 *
 *   "Igny ( Chemin du Trou Rouge)(centre Equestre )" → Igny  + the detail
 *   "Champigny/marne ( Parc du Tremblay )"           → Champigny sur marne
 *
 * The slash is this site's shorthand for "sur", so expanding it is what lets
 * "Champigny/marne" geocode to Champigny-sur-Marne. The geocoder then returns
 * the official spelling, which is what ends up stored.
 */
export function splitCommune(raw: string): { commune: string; detail?: string } {
  const openParen = raw.indexOf("(");
  const head = (openParen === -1 ? raw : raw.slice(0, openParen)).trim();
  const tail = openParen === -1 ? "" : raw.slice(openParen).trim();

  const commune = head
    .replace(/\s*\/\s*/g, " sur ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.\-]+|[\s.\-]+$/g, "");

  const detail = tail.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

  return { commune, detail: detail || undefined };
}

/** "Courses de vélo : FSGT Orne" → "Orne" */
function departmentFromTitle(title: string, federationLabel: string): string | null {
  const idx = title.lastIndexOf(":");
  if (idx === -1) return null;
  const rest = title
    .slice(idx + 1)
    .replace(new RegExp(`\\b${federationLabel}\\b`, "i"), "")
    .trim();
  return rest || null;
}

/**
 * Builds the supplementary note for a race.
 *
 * The anchor text normally just repeats the commune and the discipline, both of
 * which are already stored as their own fields; only what remains after
 * removing them is worth keeping.
 */
function buildNotes(
  city: string,
  detail: string | undefined,
  anchorText: string,
  discipline: Discipline
): string | undefined {
  const parts: string[] = [];

  if (detail) parts.push(titleCasePlace(detail));

  const leftover = anchorText
    // Drop the venue detail, already captured above.
    .replace(/\([^)]*\)?/g, " ")
    // Drop the commune, however the source spelled it.
    .replace(new RegExp(escapeRegExp(city), "gi"), " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/[.·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // What survives is only meaningful if it is not just the discipline again.
  const leftoverKey = stripAccentsLower(leftover).replace(/[^a-z0-9]/g, "");
  const isJustDiscipline =
    leftoverKey.length === 0 ||
    leftoverKey === discipline.replace(/_/g, "") ||
    DISCIPLINE_PATTERNS.some(
      ([pattern]) => pattern.test(leftover) && leftover.length <= 12
    );

  if (!isJustDiscipline && leftover.length > 3) parts.push(leftover);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CyclismeAmateurOptions {
  /** Query value for `fed=` — "FSGT" or "UFOLEP". */
  federationLabel: string;
  federationId: number;
  /** Prefix for externalId, keeping ids distinct per federation. */
  idPrefix: string;
  maxPages?: number;
}

export async function scrapeCyclismeAmateur(
  options: CyclismeAmateurOptions
): Promise<ScraperResult> {
  const { federationLabel, federationId, idPrefix, maxPages = 40 } = options;
  const start = Date.now();
  const errors: ScraperError[] = [];
  const byId = new Map<string, ScrapedRace>();
  const referenceYear = new Date().getUTCFullYear();

  for (let page = 1; page <= maxPages; page++) {
    const url =
      page === 1
        ? `${BASE_URL}/course.php?fed=${federationLabel}`
        : `${BASE_URL}/course.php?fed=${federationLabel}&page=${page}`;

    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ url, message });
      break;
    }

    const $ = cheerio.load(html);
    const table = $("table.avec-contour").first();
    if (table.length === 0) break;

    let currentDate: Date | null = null;
    let pageCount = 0;

    table.find("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return; // header

      // A date cell carries a rowspan; following rows in the group omit it.
      let offset = 0;
      const dateText = $(cells[0]).find(".cellule_td_course").text().trim();
      if (dateText) {
        const parsed = parseDateCell(dateText, referenceYear);
        if (parsed) currentDate = parsed;
        offset = 1;
      }

      const deptCell = $(cells[offset]);
      const raceCell = $(cells[offset + 1]);
      if (raceCell.length === 0 || !currentDate) return;

      const anchor = raceCell.find("a").first();
      const href = anchor.attr("href") ?? "";
      const idMatch = /\/course-(\d+)-/.exec(href);
      if (!idMatch) return;

      const externalId = `${idPrefix}-${idMatch[1]}`;
      if (byId.has(externalId)) return;

      // The cell title holds the complete commune name; the anchor text is
      // truncated by the source and is only used for extra context.
      const rawCity = cityFromTitle(raceCell.attr("title") ?? "");
      const anchorText = anchor.text().replace(/\s+/g, " ").trim();
      const { commune, detail } = splitCommune(
        rawCity ?? anchorText.replace(/\s*\.\s*$/, "")
      );
      const city = titleCasePlace(commune);
      if (!city) return;

      const deptTitle = deptCell.attr("title") ?? "";
      const departmentName = departmentFromTitle(deptTitle, federationLabel);
      const deptDigits = deptCell.find("a").first().text().replace(/\D/g, "");
      const departmentCode = deptDigits ? deptDigits.padStart(2, "0") : undefined;

      const extraCell = cells.length > offset + 2 ? $(cells[offset + 2]).text() : "";
      const discipline = detectDiscipline(anchorText, extraCell);

      // Keep what the source says beyond the commune: the start-location detail
      // ("Parc du Tremblay") and the event's popular name ("fête des
      // célibataires"). Neither can be the race title — the anchor truncates
      // mid-word — but both are worth showing on the race page.
      const notes = buildNotes(city, detail, anchorText, discipline);

      byId.set(externalId, {
        externalId,
        name: city,
        raceDate: currentDate,
        city,
        departmentCode,
        departmentName: departmentName ?? undefined,
        discipline,
        level: "local",
        categories: [],
        gender: "mixed",
        sourceUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
        notes,
        isCancelled: false,
      });
      pageCount++;
    });

    console.log(`  ${federationLabel} page ${page}: ${pageCount} races`);
    if (pageCount === 0) break;

    await politeDelay(500);
  }

  return {
    federationId,
    races: [...byId.values()],
    errors,
    durationMs: Date.now() - start,
    // The site publishes a single rolling list of every upcoming race, so a
    // clean run is authoritative for the whole future.
    coverageDays: errors.length === 0 ? 365 : undefined,
  };
}

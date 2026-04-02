/**
 * FFC Scraper — competitions.ffc.fr
 *
 * Strategy:
 * 1. Fetch the calendar for each month of the current + next year
 * 2. Extract race links from HTML (Cheerio)
 * 3. Fetch each detail page to get full info
 */

import * as cheerio from "cheerio";
import type { ScrapedRace, ScraperResult, ScraperError } from "../../lib/scraper-types";
import { httpClient, politeDelay } from "./utils/http";
import { parseFrenchDate } from "./utils/parse-date";

const BASE_URL = "https://competitions.ffc.fr";
const FEDERATION_ID = 1;

const DISCIPLINE_MAP: Record<string, ScrapedRace["discipline"]> = {
  route: "route",
  "sur route": "route",
  vtt: "vtt",
  "vélo tout terrain": "vtt",
  cyclo: "cyclocross",
  cyclocross: "cyclocross",
  bmx: "bmx",
  piste: "piste",
  "contre-la-montre": "contre_la_montre",
  clm: "contre_la_montre",
  "course par étapes": "course_par_etapes",
  étapes: "course_par_etapes",
};

const LEVEL_MAP: Record<string, ScrapedRace["level"]> = {
  international: "international",
  national: "national",
  régional: "regional",
  regional: "regional",
  local: "local",
  "département": "local",
  departemental: "local",
};

function normalizeDiscipline(raw: string): ScrapedRace["discipline"] {
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(DISCIPLINE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return "route";
}

function normalizeLevel(raw: string): ScrapedRace["level"] | undefined {
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(LEVEL_MAP)) {
    if (lower.includes(key)) return val;
  }
  return undefined;
}

async function fetchCalendarMonth(
  year: number,
  month: number
): Promise<string[]> {
  // FFC calendar URL with date filter
  const debut = `01/${String(month).padStart(2, "0")}/${year}`;
  const fin = `${new Date(year, month, 0).getDate()}/${String(month).padStart(2, "0")}/${year}`;

  const url = `${BASE_URL}/calendrier/calendrier.aspx?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}&discipline=&categorie=&departement=&type=&carte=0`;

  try {
    const { data } = await httpClient.get<string>(url);
    const $ = cheerio.load(data);

    const links: string[] = [];
    // Find competition links — various possible selectors on FFC site
    $("a[href*='/calendrier/competition/']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const full = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        if (!links.includes(full)) links.push(full);
      }
    });

    return links;
  } catch (err) {
    console.error(`FFC: failed to fetch calendar ${year}/${month}:`, err);
    return [];
  }
}

// Map French department names to codes (most common)
const DEPT_NAME_TO_CODE: Record<string, string> = {
  "ain": "01", "aisne": "02", "allier": "03", "alpes-de-haute-provence": "04",
  "hautes-alpes": "05", "alpes-maritimes": "06", "ardèche": "07", "ardennes": "08",
  "ariège": "09", "aube": "10", "aude": "11", "aveyron": "12",
  "bouches-du-rhône": "13", "calvados": "14", "cantal": "15", "charente": "16",
  "charente-maritime": "17", "cher": "18", "corrèze": "19", "corse-du-sud": "2a",
  "haute-corse": "2b", "côte-d'or": "21", "côtes-d'armor": "22", "creuse": "23",
  "dordogne": "24", "doubs": "25", "drôme": "26", "eure": "27", "eure-et-loir": "28",
  "finistère": "29", "gard": "30", "haute-garonne": "31", "gers": "32", "gironde": "33",
  "hérault": "34", "ille-et-vilaine": "35", "indre": "36", "indre-et-loire": "37",
  "isère": "38", "jura": "39", "landes": "40", "loir-et-cher": "41", "loire": "42",
  "haute-loire": "43", "loire-atlantique": "44", "loiret": "45", "lot": "46",
  "lot-et-garonne": "47", "lozère": "48", "maine-et-loire": "49", "manche": "50",
  "marne": "51", "haute-marne": "52", "mayenne": "53", "meurthe-et-moselle": "54",
  "meuse": "55", "morbihan": "56", "moselle": "57", "nièvre": "58", "nord": "59",
  "oise": "60", "orne": "61", "pas-de-calais": "62", "puy-de-dôme": "63",
  "pyrénées-atlantiques": "64", "hautes-pyrénées": "65", "pyrénées-orientales": "66",
  "bas-rhin": "67", "haut-rhin": "68", "rhône": "69", "haute-saône": "70",
  "saône-et-loire": "71", "sarthe": "72", "savoie": "73", "haute-savoie": "74",
  "paris": "75", "seine-maritime": "76", "seine-et-marne": "77", "yvelines": "78",
  "deux-sèvres": "79", "somme": "80", "tarn": "81", "tarn-et-garonne": "82",
  "var": "83", "vaucluse": "84", "vendée": "85", "vienne": "86", "haute-vienne": "87",
  "vosges": "88", "yonne": "89", "territoire de belfort": "90", "essonne": "91",
  "hauts-de-seine": "92", "seine-saint-denis": "93", "val-de-marne": "94", "val-d'oise": "95",
};

function deptNameToCode(name: string): string | undefined {
  return DEPT_NAME_TO_CODE[name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0300-\u036f]/g, "")];
}

async function fetchRaceDetail(url: string): Promise<ScrapedRace | null> {
  try {
    const { data } = await httpClient.get<string>(url);
    const $ = cheerio.load(data);

    // External ID from URL: /calendrier/competition/{year}/{id}/
    const urlMatch = url.match(/\/calendrier\/competition\/\d+\/([^\/]+)/);
    const externalId = urlMatch ? urlMatch[1] : url;

    // Race name from <title>
    const rawTitle = $("title").text().trim();
    const name = rawTitle.replace(/\s*-\s*Compétitions FFC\s*$/i, "").trim();
    if (!name) return null;

    // Meta description: "Compétition FFC dans la discipline {disc} sur la saison {yr}
    //   se déroulant {weekday} {day} {month} {year}. Lieu : {location}. Inscrite au calendrier {level}."
    const desc = $('meta[name="description"]').attr("content") ?? "";

    // Discipline
    const discMatch = desc.match(/dans la discipline ([^\s]+(?:\s[^\s]+)?)\s+sur/i);
    const discipline = discMatch ? normalizeDiscipline(discMatch[1]) : "route";

    // Date — handle single day and multi-day ("du X au Y mois année")
    let raceDate: Date | null = null;
    let raceDateEnd: Date | null = null;
    const multiDayMatch = desc.match(/du (\d{1,2}) au (\d{1,2}) (\w+) (\d{4})/i);
    const singleDayMatch = desc.match(/se déroulant (?:\w+ )?(\d{1,2} \w+ \d{4})/i);
    if (multiDayMatch) {
      raceDate = parseFrenchDate(`${multiDayMatch[1]} ${multiDayMatch[3]} ${multiDayMatch[4]}`);
      raceDateEnd = parseFrenchDate(`${multiDayMatch[2]} ${multiDayMatch[3]} ${multiDayMatch[4]}`);
    } else if (singleDayMatch) {
      raceDate = parseFrenchDate(singleDayMatch[1]);
    }

    // Fallback: look for date in body text
    if (!raceDate) {
      const bodyText = $("body").text();
      const dm = bodyText.match(/(\d{1,2}\/\d{2}\/\d{4})/);
      if (dm) raceDate = parseFrenchDate(dm[1]);
    }
    if (!raceDate) return null;

    // Location — "Lieu : Ille-et-Vilaine."
    const locationMatch = desc.match(/Lieu\s*:\s*([^.]+)\./i);
    const city = locationMatch ? locationMatch[1].trim() : "";
    if (!city) return null;

    // Department code from name
    const departmentCode = deptNameToCode(city);

    // Level — "Inscrite au calendrier International"
    const levelMatch = desc.match(/Inscrite au calendrier (\w+)/i);
    const level = levelMatch ? normalizeLevel(levelMatch[1]) : undefined;

    // Cancelled status — look for explicit cancellation phrases
    // Avoid matching "annuel" (annual) which appears on every FFC calendar page
    const bodyText = $("body").text().toLowerCase();
    const isCancelled = /\bannul[eé]e?\b/.test(bodyText) &&
      (bodyText.includes("épreuve annul") || bodyText.includes("course annul") || bodyText.includes("compétition annul"));

    return {
      externalId,
      name,
      raceDate,
      raceDateEnd: raceDateEnd ?? undefined,
      city,
      departmentCode,
      departmentName: city,
      discipline,
      level,
      categories: [],
      gender: "mixed",
      sourceUrl: url,
      isCancelled,
    };
  } catch (err) {
    console.error(`FFC: failed to fetch detail ${url}:`, err);
    return null;
  }
}

export async function scrapeFFC(): Promise<ScraperResult> {
  const start = Date.now();
  const races: ScrapedRace[] = [];
  const errors: ScraperError[] = [];

  const now = new Date();
  const months: Array<[number, number]> = [];

  // Scrape current month + next 12 months
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push([d.getFullYear(), d.getMonth() + 1]);
  }

  const allLinks = new Set<string>();

  for (const [year, month] of months) {
    console.log(`FFC: fetching calendar ${year}/${month}...`);
    const links = await fetchCalendarMonth(year, month);
    links.forEach((l) => allLinks.add(l));
    await politeDelay(600);
  }

  const linkArray = Array.from(allLinks);
  console.log(`FFC: found ${linkArray.length} race links, fetching details (8 concurrent)...`);

  const CONCURRENCY = 8;
  for (let i = 0; i < linkArray.length; i += CONCURRENCY) {
    const chunk = linkArray.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((url) => fetchRaceDetail(url)));
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status === "fulfilled" && res.value) {
        races.push(res.value);
      } else {
        errors.push({ url: chunk[j], message: "Failed to parse race detail" });
      }
    }
    if (i % 80 === 0 && i > 0) {
      console.log(`FFC: ${i}/${linkArray.length} processed, ${races.length} valid races so far...`);
    }
    await politeDelay(300);
  }

  return {
    federationId: FEDERATION_ID,
    races,
    errors,
    durationMs: Date.now() - start,
  };
}

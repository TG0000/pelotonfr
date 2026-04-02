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

async function fetchRaceDetail(url: string): Promise<ScrapedRace | null> {
  try {
    const { data } = await httpClient.get<string>(url);
    const $ = cheerio.load(data);

    // Extract external ID from URL
    const urlMatch = url.match(/\/calendrier\/competition\/\d+\/(\d+)\//);
    const externalId = urlMatch ? urlMatch[1] : url;

    // Title — try various selectors
    const name =
      $("h1").first().text().trim() ||
      $(".competition-title").first().text().trim() ||
      $("title").text().replace(" - FFC", "").trim();

    if (!name) return null;

    // Extract fields from detail blocks
    let raceDate: Date | null = null;
    let raceDateEnd: Date | null = null;
    let city = "";
    let departmentCode: string | undefined;
    let discipline: ScrapedRace["discipline"] = "route";
    let level: ScrapedRace["level"] | undefined;
    const categories: string[] = [];
    let organizer: string | undefined;

    // Try to find structured data in definition lists or labeled spans
    $(".detail-item, .info-item, dl dt, .competition-info").each((_, el) => {
      const label = $(el).text().toLowerCase();
      const value = $(el).next().text().trim() || $(el).siblings(".value").text().trim();

      if (label.includes("date")) {
        const parsed = parseFrenchDate(value);
        if (parsed && !raceDate) raceDate = parsed;
      } else if (label.includes("lieu") || label.includes("ville")) {
        city = value;
      } else if (label.includes("discipline")) {
        discipline = normalizeDiscipline(value);
      } else if (label.includes("niveau") || label.includes("niveau de course")) {
        level = normalizeLevel(value);
      } else if (label.includes("catégorie")) {
        categories.push(...value.split(/[,;/]/).map((c) => c.trim()).filter(Boolean));
      } else if (label.includes("organis")) {
        organizer = value;
      } else if (label.includes("département") || label.includes("dept")) {
        departmentCode = value.match(/\d{2,3}/)?.[0];
      }
    });

    // Fallback: try to extract date from text content
    if (!raceDate) {
      const bodyText = $("body").text();
      const dateMatch = bodyText.match(/(\d{1,2}\/\d{2}\/\d{4})/);
      if (dateMatch) {
        raceDate = parseFrenchDate(dateMatch[1]);
      }
    }

    if (!raceDate) return null;
    if (!city) {
      // Try to extract city from page content
      const cityEl = $("[class*='city'], [class*='lieu'], [class*='ville']").first();
      city = cityEl.text().trim() || "";
    }
    if (!city) return null;

    return {
      externalId,
      name,
      raceDate,
      raceDateEnd: raceDateEnd ?? undefined,
      city,
      departmentCode,
      discipline,
      level,
      categories,
      gender: "mixed",
      sourceUrl: url,
      organizer,
      isCancelled: false,
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

  console.log(`FFC: found ${allLinks.size} race links, fetching details...`);

  for (const url of allLinks) {
    const race = await fetchRaceDetail(url);
    if (race) {
      races.push(race);
    } else {
      errors.push({ url, message: "Failed to parse race detail" });
    }
    await politeDelay(800);
  }

  return {
    federationId: FEDERATION_ID,
    races,
    errors,
    durationMs: Date.now() - start,
  };
}

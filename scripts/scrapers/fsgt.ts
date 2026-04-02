/**
 * FSGT Scraper — via cyclisme-amateur.com
 *
 * cyclisme-amateur.com aggregates races from all French federations
 * including FSGT. Races are listed in HTML tables with date, name, city,
 * department, and category.
 */

import * as cheerio from "cheerio";
import type { ScrapedRace, ScraperResult } from "../../lib/scraper-types";
import { httpClient, politeDelay } from "./utils/http";
import { parseFrenchDate } from "./utils/parse-date";

const BASE_URL = "http://www.cyclisme-amateur.com";
const FEDERATION_ID = 2;

const DISCIPLINE_MAP: Record<string, ScrapedRace["discipline"]> = {
  route: "route",
  clm: "contre_la_montre",
  "contre-la-montre": "contre_la_montre",
  étapes: "course_par_etapes",
  cyclosport: "cyclosportive",
  cyclo: "cyclosportive",
  vtt: "vtt",
  cross: "cyclocross",
  cyclocross: "cyclocross",
};

function normalizeDiscipline(raw: string): ScrapedRace["discipline"] {
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(DISCIPLINE_MAP)) {
    if (lower.includes(k)) return v;
  }
  return "route";
}

async function fetchPage(year: number, month?: number): Promise<ScrapedRace[]> {
  const monthParam = month ? `&mois=${month}` : "";
  const url = `${BASE_URL}/course.php?fed=FSGT&annee=${year}${monthParam}`;

  try {
    const { data } = await httpClient.get<string>(url);
    const $ = cheerio.load(data);
    const races: ScrapedRace[] = [];

    $("table tr").each((i, row) => {
      if (i === 0) return; // skip header
      const cells = $(row).find("td");
      if (cells.length < 4) return;

      const dateStr = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      const city = $(cells[2]).text().trim();
      const dept = $(cells[3]).text().trim();
      const catStr = $(cells[4])?.text().trim() ?? "";
      const discStr = $(cells[5])?.text().trim() ?? "";

      const raceDate = parseFrenchDate(dateStr);
      if (!raceDate || !name || !city) return;

      const categories = catStr
        ? catStr.split(/[,;/]/).map((c) => c.trim()).filter(Boolean)
        : [];

      const externalId = `fsgt-${dateStr}-${name}-${city}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");

      races.push({
        externalId,
        name,
        raceDate,
        city,
        departmentCode: dept.match(/\d{2,3}/)?.[0],
        discipline: normalizeDiscipline(discStr || name),
        categories,
        gender: "mixed",
        isCancelled: false,
        level: "local",
      });
    });

    return races;
  } catch (err) {
    console.error(`FSGT: failed to fetch page ${url}:`, err);
    return [];
  }
}

export async function scrapeFSGT(): Promise<ScraperResult> {
  const start = Date.now();
  const races: ScrapedRace[] = [];
  const errors: ScraperResult["errors"] = [];

  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];

  for (const year of years) {
    console.log(`FSGT: fetching year ${year}...`);
    const yearRaces = await fetchPage(year);
    races.push(...yearRaces);
    await politeDelay(600);
  }

  return {
    federationId: FEDERATION_ID,
    races,
    errors,
    durationMs: Date.now() - start,
  };
}

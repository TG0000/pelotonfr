/**
 * UFOLEP Scraper — multi-site regional strategy
 *
 * UFOLEP is decentralized. Each region runs its own site.
 * We maintain a list of known sites and use a common table parser.
 */

import * as cheerio from "cheerio";
import type { ScrapedRace, ScraperResult } from "../../lib/scraper-types";
import { httpClient, politeDelay } from "./utils/http";
import { parseFrenchDate } from "./utils/parse-date";

const FEDERATION_ID = 3;

interface RegionalSite {
  name: string;
  url: string;
  departmentCode?: string;
  departmentName?: string;
  region?: string;
}

// Known UFOLEP regional cycling calendar URLs
const REGIONAL_SITES: RegionalSite[] = [
  {
    name: "UFOLEP Nord-Pas-de-Calais (59/62)",
    url: "https://www.cyclismeufolep5962.fr/calResRoute.php",
    region: "Hauts-de-France",
  },
  {
    name: "UFOLEP Cyclisme National",
    url: "https://www.ufolep-cyclisme.org/calendrier",
    region: "National",
  },
  {
    name: "FSGT/UFOLEP via cyclisme-amateur",
    url: "http://www.cyclisme-amateur.com/course.php?fed=UFOLEP",
    region: "National",
  },
];

async function scrapeRegionalSite(site: RegionalSite): Promise<ScrapedRace[]> {
  try {
    const { data } = await httpClient.get<string>(site.url);
    const $ = cheerio.load(data);
    const races: ScrapedRace[] = [];

    // Try various table structures
    $("table tr, .race-row, .event-row").each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find("td, .cell");
      if (cells.length < 3) return;

      const dateStr = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      const city = $(cells[2]).text().trim();
      const catStr = $(cells[3])?.text().trim() ?? "";

      const raceDate = parseFrenchDate(dateStr);
      if (!raceDate || !name || !city) return;

      const externalId = `ufolep-${site.departmentCode ?? "xx"}-${dateStr}-${name}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");

      races.push({
        externalId,
        name,
        raceDate,
        city,
        departmentCode: site.departmentCode,
        departmentName: site.departmentName,
        discipline: "route",
        categories: catStr
          ? catStr.split(/[,;/]/).map((c) => c.trim()).filter(Boolean)
          : [],
        gender: "mixed",
        isCancelled: false,
        level: "local",
      });
    });

    return races;
  } catch (err) {
    console.error(`UFOLEP: failed to scrape ${site.url}:`, err);
    return [];
  }
}

export async function scrapeUFOLEP(): Promise<ScraperResult> {
  const start = Date.now();
  const allRaces: ScrapedRace[] = [];
  const errors: ScraperResult["errors"] = [];

  for (const site of REGIONAL_SITES) {
    console.log(`UFOLEP: scraping ${site.name}...`);
    const races = await scrapeRegionalSite(site);
    console.log(`  → ${races.length} races`);
    allRaces.push(...races);
    await politeDelay(800);
  }

  // Deduplicate by externalId
  const seen = new Set<string>();
  const deduplicated = allRaces.filter((r) => {
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });

  return {
    federationId: FEDERATION_ID,
    races: deduplicated,
    errors,
    durationMs: Date.now() - start,
  };
}

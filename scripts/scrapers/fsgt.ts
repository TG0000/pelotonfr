/**
 * FSGT Scraper — cyclisme-amateur.com
 *
 * Strategy:
 * 1. Fetch paginated race list: course.php?fed=FSGT&annee=YEAR&page=N
 * 2. Parse table.avec-contour rows; carry date forward across rowspan groups
 * 3. Extract race ID from detail URL href for stable externalId
 */

import * as cheerio from "cheerio";
import type { ScrapedRace, ScraperResult } from "../../lib/scraper-types";
import { httpClient, politeDelay } from "./utils/http";

const BASE_URL = "http://www.cyclisme-amateur.com";
const FEDERATION_ID = 2;

const DISCIPLINE_MAP: Record<string, ScrapedRace["discipline"]> = {
  vtt: "vtt",
  cyclocross: "cyclocross",
  cross: "cyclocross",
  clm: "contre_la_montre",
  "contre-la-montre": "contre_la_montre",
  étapes: "course_par_etapes",
  randonnee: "cyclosportive",
  randonnée: "cyclosportive",
  cyclosport: "cyclosportive",
  cyclo: "cyclosportive",
  route: "route",
};

// Abbreviated French month names as used by cyclisme-amateur.com
const ABBR_MONTHS: Record<string, number> = {
  janv: 1, févr: 2, fevr: 2, mars: 3, avri: 4, mai: 5, juin: 6,
  juil: 7, août: 8, aout: 8, sept: 9, octo: 10, nove: 11, déce: 12, dece: 12,
};

function parseAbbrDate(raw: string, year: number): Date | null {
  // e.g. "Sam 04 Avri." or "Dim 12 Mars"
  const m = raw.trim().match(/\w+\s+(\d{1,2})\s+(\w+)/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase().replace(/\.$/, "").substring(0, 4);
  const month = ABBR_MONTHS[monthKey];
  if (!month) return null;
  const d = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeDiscipline(raw: string): ScrapedRace["discipline"] {
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(DISCIPLINE_MAP)) {
    if (lower.includes(k)) return v;
  }
  return "route";
}

async function fetchYear(year: number): Promise<ScrapedRace[]> {
  const allRaces: ScrapedRace[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url =
      page === 1
        ? `${BASE_URL}/course.php?fed=FSGT&annee=${year}`
        : `${BASE_URL}/course.php?fed=FSGT&annee=${year}&page=${page}`;

    try {
      const { data } = await httpClient.get<string>(url);
      const $ = cheerio.load(data);

      // Detect last page from pagination — stop if no next-page link
      const pageLinks = $("#selecteur_page a")
        .map((_, el) => parseInt($(el).text().trim(), 10))
        .get()
        .filter((n) => !isNaN(n));
      const lastPage = pageLinks.length > 0 ? Math.max(...pageLinks) : page;
      if (page >= lastPage) hasMore = false;

      // Target the race table specifically
      const raceTable = $("table.avec-contour").first();
      if (!raceTable.length) {
        hasMore = false;
        break;
      }

      let currentDate: Date | null = null;
      const pageRaces: ScrapedRace[] = [];

      raceTable.find("tr").each((i, row) => {
        const tds = $(row).find("td");
        if (tds.length === 0) return; // header row with th

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let deptTd: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let nameTd: any;

        if (tds.length >= 4) {
          // First row of a date group: date | dept | name | categories
          const dateDiv = $(tds[0]).find(".cellule_td_course").text().trim();
          if (dateDiv) {
            currentDate = parseAbbrDate(dateDiv, year);
          }
          deptTd = $(tds[1]);
          nameTd = $(tds[2]);
        } else if (tds.length === 3) {
          // Continuation row (date from rowspan): dept | name | categories
          deptTd = $(tds[0]);
          nameTd = $(tds[1]);
        } else {
          return;
        }

        if (!currentDate) return;

        // Department code from the link text (e.g. "28")
        const deptLink = deptTd.find("a").first();
        const deptCode = deptLink.text().trim().replace(/\D/g, "").padStart(2, "0") || undefined;
        // Department name from the td title attr
        const deptTitle = deptTd.attr("title") ?? "";
        const deptNameMatch = deptTitle.match(/FSGT\s+(.+)$/i);
        const deptName = deptNameMatch ? deptNameMatch[1].trim() : undefined;

        // Race link
        const nameLink = nameTd.find("a").first();
        const rawNameText = nameLink.text().trim();
        if (!rawNameText) return;

        const href = nameLink.attr("href") ?? "";
        // Extract externalId from URL: /course-228043-maintenon-fsgt.html → fsgt-228043
        const idMatch = href.match(/\/course-(\d+)-/);
        const externalId = idMatch ? `fsgt-${idMatch[1]}` : undefined;
        if (!externalId) return;

        const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

        // Split "Maintenon . VTT" → name="Maintenon", type="VTT"
        // Also handle "Precigne ." (no type) → name="Precigne"
        const dotParts = rawNameText.split(/\s+\.\s+/);
        const name = dotParts[0].trim().replace(/\s*\.$/, "").trim();
        const typeStr = dotParts[1]?.trim() ?? "";
        const discipline = normalizeDiscipline(typeStr || name);

        // City: extract from name td title attr
        const nameTdTitle = nameTd.attr("title") ?? "";
        const cityMatch = nameTdTitle.match(/:\s*([A-ZÀ-Ö\s-]+)\s*$/i);
        const city = cityMatch ? cityMatch[1].trim() : name;

        pageRaces.push({
          externalId,
          name,
          raceDate: currentDate,
          city,
          departmentCode: deptCode,
          departmentName: deptName,
          discipline,
          categories: [],
          gender: "mixed",
          sourceUrl,
          isCancelled: false,
          level: "local",
        });
      });

      allRaces.push(...pageRaces);
      console.log(`  FSGT ${year} page ${page}: ${pageRaces.length} races`);

      // Stop if this page had no races
      if (pageRaces.length === 0) hasMore = false;
    } catch (err) {
      console.error(`FSGT: failed to fetch ${url}:`, err);
      hasMore = false;
    }

    page++;
    await politeDelay(600);
  }

  return allRaces;
}

export async function scrapeFSGT(): Promise<ScraperResult> {
  const start = Date.now();
  const races: ScrapedRace[] = [];
  const errors: ScraperResult["errors"] = [];

  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];

  for (const year of years) {
    console.log(`FSGT: fetching year ${year}...`);
    const yearRaces = await fetchYear(year);
    races.push(...yearRaces);
  }

  return {
    federationId: FEDERATION_ID,
    races,
    errors,
    durationMs: Date.now() - start,
  };
}

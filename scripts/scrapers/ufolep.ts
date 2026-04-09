/**
 * UFOLEP Scraper — multi-site regional strategy
 *
 * UFOLEP is decentralized. Each region runs its own site.
 * We also scrape cyclisme-amateur.com which aggregates UFOLEP races.
 */

import * as cheerio from "cheerio";
import type { ScrapedRace, ScraperResult } from "../../lib/scraper-types";
import { httpClient, politeDelay } from "./utils/http";
import { parseFrenchDate } from "./utils/parse-date";

const FEDERATION_ID = 3;
const BASE_CA = "http://www.cyclisme-amateur.com";

// Abbreviated French month names as used by cyclisme-amateur.com
const ABBR_MONTHS: Record<string, number> = {
  janv: 1, févr: 2, fevr: 2, mars: 3, avri: 4, mai: 5, juin: 6,
  juil: 7, août: 8, aout: 8, sept: 9, octo: 10, nove: 11, déce: 12, dece: 12,
};

function parseAbbrDate(raw: string, year: number): Date | null {
  const m = raw.trim().match(/\w+\s+(\d{1,2})\s+(\w+)/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase().replace(/\.$/, "").substring(0, 4);
  const month = ABBR_MONTHS[monthKey];
  if (!month) return null;
  const d = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

// Scrape UFOLEP races from cyclisme-amateur.com (same structure as FSGT)
async function scrapeCyclisteAmateur(fed: "UFOLEP"): Promise<ScrapedRace[]> {
  const allRaces: ScrapedRace[] = [];
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const fedPrefix = fed.toLowerCase();

  for (const year of years) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url =
        page === 1
          ? `${BASE_CA}/course.php?fed=${fed}&annee=${year}`
          : `${BASE_CA}/course.php?fed=${fed}&annee=${year}&page=${page}`;

      try {
        const { data } = await httpClient.get<string>(url);
        const $ = cheerio.load(data);

        const pageLinks = $("#selecteur_page a")
          .map((_, el) => parseInt($(el).text().trim(), 10))
          .get()
          .filter((n) => !isNaN(n));
        const lastPage = pageLinks.length > 0 ? Math.max(...pageLinks) : page;
        if (page >= lastPage) hasMore = false;

        const raceTable = $("table.avec-contour").first();
        if (!raceTable.length) { hasMore = false; break; }

        let currentDate: Date | null = null;
        let pageCount = 0;

        raceTable.find("tr").each((_, row) => {
          const tds = $(row).find("td");
          if (tds.length === 0) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let deptTd: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let nameTd: any;

          if (tds.length >= 4) {
            const dateDiv = $(tds[0]).find(".cellule_td_course").text().trim();
            if (dateDiv) currentDate = parseAbbrDate(dateDiv, year);
            deptTd = $(tds[1]);
            nameTd = $(tds[2]);
          } else if (tds.length === 3) {
            deptTd = $(tds[0]);
            nameTd = $(tds[1]);
          } else {
            return;
          }

          if (!currentDate) return;

          const deptCode = deptTd.find("a").first().text().trim().replace(/\D/g, "").padStart(2, "0") || undefined;
          const deptTitle = deptTd.attr("title") ?? "";
          const deptNameMatch = deptTitle.match(new RegExp(`${fed}\\s+(.+)$`, "i"));
          const deptName = deptNameMatch ? deptNameMatch[1].trim() : undefined;

          const nameLink = nameTd.find("a").first();
          const rawNameText = nameLink.text().trim();
          if (!rawNameText) return;

          const href = nameLink.attr("href") ?? "";
          const idMatch = href.match(/\/course-(\d+)-/);
          if (!idMatch) return;
          const externalId = `${fedPrefix}-${idMatch[1]}`;

          const dotParts = rawNameText.split(/\s+\.\s+/);
          const name = dotParts[0].trim().replace(/\s*\.$/, "").trim();

          const nameTdTitle = nameTd.attr("title") ?? "";
          const cityMatch = nameTdTitle.match(/:\s*([A-ZÀ-Ö\s-]+)\s*$/i);
          const city = cityMatch ? cityMatch[1].trim() : name;

          allRaces.push({
            externalId,
            name,
            raceDate: currentDate,
            city,
            departmentCode: deptCode,
            departmentName: deptName,
            discipline: "route",
            categories: [],
            gender: "mixed",
            sourceUrl: href.startsWith("http") ? href : `${BASE_CA}${href}`,
            isCancelled: false,
            level: "local",
          });
          pageCount++;
        });

        if (pageCount === 0) hasMore = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`UFOLEP cyclisme-amateur: page ${page} error: ${msg}`);
        hasMore = false;
      }

      page++;
      await politeDelay(600);
    }
  }

  return allRaces;
}

// Scrape UFOLEP Nord-Pas-de-Calais (5962)
async function scrapeNordPasDeCalais(): Promise<ScrapedRace[]> {
  const url = "https://www.cyclismeufolep5962.fr/calResRoute.php";
  try {
    const { data } = await httpClient.get<string>(url);
    const $ = cheerio.load(data);
    const races: ScrapedRace[] = [];

    $("table tr").each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find("td");
      if (cells.length < 3) return;

      const dateStr = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      const city = $(cells[2]).text().trim();
      const catStr = $(cells[3])?.text().trim() ?? "";

      const raceDate = parseFrenchDate(dateStr);
      if (!raceDate || !name || !city) return;

      const externalId = `ufolep-5962-${dateStr}-${name}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");

      races.push({
        externalId,
        name,
        raceDate,
        city,
        departmentCode: undefined,
        departmentName: "Nord-Pas-de-Calais",
        discipline: "route",
        categories: catStr ? catStr.split(/[,;/]/).map((c) => c.trim()).filter(Boolean) : [],
        gender: "mixed",
        isCancelled: false,
        level: "local",
      });
    });

    return races;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`UFOLEP Nord-PdC: failed: ${msg}`);
    return [];
  }
}

export async function scrapeUFOLEP(): Promise<ScraperResult> {
  const start = Date.now();
  const errors: ScraperResult["errors"] = [];

  // 1. Nord-Pas-de-Calais regional site
  console.log("UFOLEP: scraping Nord-Pas-de-Calais...");
  const npdcRaces = await scrapeNordPasDeCalais();
  console.log(`  → ${npdcRaces.length} races`);
  await politeDelay(800);

  // 2. cyclisme-amateur.com UFOLEP calendar
  console.log("UFOLEP: scraping via cyclisme-amateur.com...");
  const caRaces = await scrapeCyclisteAmateur("UFOLEP");
  console.log(`  → ${caRaces.length} races`);

  const allRaces = [...npdcRaces, ...caRaces];

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

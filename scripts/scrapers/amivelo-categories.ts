/**
 * Category enrichment from cyclisme-amateur's department pages.
 *
 *   npx tsx scripts/scrapers/amivelo-categories.ts [--dry-run] [--only=orne]
 *
 * The federation calendars we scrape publish categories unevenly: the FFC
 * encodes them in the race title, while cyclisme-amateur's own calendar lists
 * races by town and says nothing at all — so every FSGT and UFOLEP race had an
 * empty category and could not be filtered or compared.
 *
 * Its *department* pages do carry them, in a dedicated column, for all three
 * federations at once:
 *
 *   Dimanche 02 | Colombiers | FSGT | ROUTE | 3 SEUL
 *   Samedi 29   | Carrouges  | FFC  | ROUTE | OPEN 1,2,3 + ACCESS 1,2,3,4
 *
 * That makes this ~95 requests for the whole country rather than one per race,
 * and it also yields the race qualifier ("Critérium nocturne") and an explicit
 * cancellation marker.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { fetchHtml, politeDelay } from "./utils/http";
import { createSql } from "./utils/db";
import {
  normalizeCategories,
  extractQualifier,
  mentionsCancellation,
} from "../../lib/categories";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE_URL = "http://www.cyclisme-amateur.com";

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const FEDERATIONS: Record<string, number> = { ffc: 1, fsgt: 2, ufolep: 3 };

/** Department names as the site slugs them: accent-free, hyphenated. */
const DEPARTMENTS = [
  "ain", "aisne", "allier", "alpes-de-haute-provence", "hautes-alpes",
  "alpes-maritimes", "ardeche", "ardennes", "ariege", "aube", "aude", "aveyron",
  "bouches-du-rhone", "calvados", "cantal", "charente", "charente-maritime",
  "cher", "correze", "corse-du-sud", "haute-corse", "cote-d-or", "cotes-d-armor",
  "creuse", "dordogne", "doubs", "drome", "eure", "eure-et-loir", "finistere",
  "gard", "haute-garonne", "gers", "gironde", "herault", "ille-et-vilaine",
  "indre", "indre-et-loire", "isere", "jura", "landes", "loir-et-cher", "loire",
  "haute-loire", "loire-atlantique", "loiret", "lot", "lot-et-garonne", "lozere",
  "maine-et-loire", "manche", "marne", "haute-marne", "mayenne",
  "meurthe-et-moselle", "meuse", "morbihan", "moselle", "nievre", "nord", "oise",
  "orne", "pas-de-calais", "puy-de-dome", "pyrenees-atlantiques",
  "hautes-pyrenees", "pyrenees-orientales", "bas-rhin", "haut-rhin", "rhone",
  "haute-saone", "saone-et-loire", "sarthe", "savoie", "haute-savoie", "paris",
  "seine-maritime", "seine-et-marne", "yvelines", "deux-sevres", "somme", "tarn",
  "tarn-et-garonne", "var", "vaucluse", "vendee", "vienne", "haute-vienne",
  "vosges", "yonne", "territoire-de-belfort", "essonne", "hauts-de-seine",
  "seine-saint-denis", "val-de-marne", "val-d-oise",
];

function strip(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function normalizePlace(value: string): string {
  return strip(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*\/\s*/g, " sur ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Listing {
  date: string;
  commune: string;
  federationId: number;
  rawCategory: string;
}

/** Parses a department page into its listed races. */
export function parseDepartmentPage(html: string): Listing[] {
  const $ = cheerio.load(html);
  const listings: Listing[] = [];

  let year: number | null = null;
  let month: number | null = null;

  $("tr").each((_, row) => {
    const cells = $(row)
      .find("td, th")
      .map((__, c) => $(c).text().replace(/ /g, " ").replace(/\s+/g, " ").trim())
      .get();

    if (cells.length < 5) return;

    // A header row restates the month and introduces the columns.
    if (/^lieu$/i.test(cells[1])) {
      const m = /([A-Za-zÀ-ÿ]+)\s+(\d{4})/.exec(cells[0]);
      if (m) {
        month = MONTHS[strip(m[1])] ?? null;
        year = Number(m[2]);
      }
      return;
    }

    if (month === null || year === null) return;

    const dayMatch = /(\d{1,2})/.exec(cells[0]);
    if (!dayMatch) return;

    const federationId = FEDERATIONS[strip(cells[2])];
    if (!federationId) return;

    const commune = normalizePlace(cells[1]);
    if (!commune) return;

    const date = `${year}-${String(month).padStart(2, "0")}-${String(
      Number(dayMatch[1])
    ).padStart(2, "0")}`;

    listings.push({ date, commune, federationId, rawCategory: cells[4] });
  });

  return listings;
}

async function applyListing(
  listing: Listing,
  dryRun: boolean
): Promise<"updated" | "unmatched" | "ambiguous" | "empty"> {
  const federationSlug =
    listing.federationId === 1 ? "ffc" : listing.federationId === 2 ? "fsgt" : "ufolep";

  const categories = normalizeCategories(listing.rawCategory, federationSlug);
  const qualifier = extractQualifier(listing.rawCategory);
  const cancelled = mentionsCancellation(listing.rawCategory);

  if (categories.length === 0 && !qualifier && !cancelled) return "empty";

  // The department page names the town; our races carry either the venue's
  // commune or, for cyclisme-amateur sources, the town as the race name.
  const rows = await sql(
    `SELECT r.id
       FROM races r
       LEFT JOIN venues v ON v.id = r.venue_id
      WHERE r.race_date = $1::date
        AND r.federation_id = $2::smallint
        AND (
          v.normalized_city = $3
          OR lower(regexp_replace(r.city, '[^A-Za-z0-9]+', ' ', 'g')) = $3
          OR similarity(lower(r.name), $3) > 0.7
        )`,
    [listing.date, listing.federationId, listing.commune]
  );

  if (rows.length === 0) return "unmatched";

  // One listing line describes one race. When several of ours match, the press
  // is describing a meeting whose category races we already distinguish — and
  // writing its single label onto all of them destroys that. Seen for real:
  // five Saint-Germain-du-Corbéis races (École, Élite, Femmes, U15, U17) all
  // overwritten with "école de cyclisme".
  if (rows.length > 1) return "ambiguous";

  if (dryRun) return "updated";

  await sql(
    `UPDATE races
        SET categories   = CASE
                             -- The FFC encodes categories in the race title and
                             -- is authoritative for its own races; this source
                             -- exists to fill what is empty, not to overrule.
                             WHEN categories = '{}' AND $2::text[] <> '{}'
                             THEN $2::text[]
                             ELSE categories
                           END,
            race_type    = COALESCE(race_type, $3::varchar),
            is_cancelled = is_cancelled OR $4::boolean
      WHERE id = $1::uuid`,
    [rows[0].id, categories, qualifier, cancelled]
  );

  return "updated";
}

/**
 * Second pass: read the remaining races' own pages.
 *
 * The department listings are cheap but incomplete — they cover roughly half of
 * the FSGT and UFOLEP calendar. Each race's own page states its category in the
 * heading ("Course UFOLEP, JOSNES - 06 Septembre 2026 - 1,2 + Juniors"), along
 * with the discipline, so the leftovers are resolved one page each. Bounded to
 * the races still missing a category rather than the whole calendar.
 */
async function fillFromDetailPages(dryRun: boolean): Promise<number> {
  const rows = await sql(
    `SELECT id, federation_id, source_url
       FROM races
      WHERE federation_id IN (2, 3)
        AND is_active
        AND categories = '{}'
        AND source_url IS NOT NULL
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
      ORDER BY race_date`
  );

  if (rows.length === 0) return 0;
  console.log(`\n--- pages détail : ${rows.length} courses sans catégorie ---`);

  let filled = 0;

  for (const [index, row] of rows.entries()) {
    const federationSlug = row.federation_id === 2 ? "fsgt" : "ufolep";
    let html: string;
    try {
      html = await fetchHtml(row.source_url as string);
    } catch {
      continue;
    }

    const $ = cheerio.load(html);
    const heading =
      $("h1").first().text().replace(/\s+/g, " ").trim() ||
      $("title").first().text().replace(/\s+/g, " ").trim();

    // Everything after the date is the category statement.
    const tail = heading.split(/\s-\s/).slice(2).join(" - ").trim();
    if (!tail) continue;

    const categories = normalizeCategories(tail, federationSlug);
    const qualifier = extractQualifier(tail) ?? extractQualifier(heading);
    if (categories.length === 0 && !qualifier) continue;

    if (!dryRun) {
      await sql(
        `UPDATE races
            SET categories = CASE WHEN $2::text[] <> '{}' THEN $2::text[] ELSE categories END,
                race_type  = COALESCE(race_type, $3::varchar)
          WHERE id = $1::uuid`,
        [row.id, categories, qualifier]
      );
    }
    if (categories.length > 0) filled++;

    if ((index + 1) % 40 === 0) {
      console.log(`  ${index + 1}/${rows.length} — ${filled} renseignées`);
    }
    await politeDelay(250);
  }

  return filled;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const departments = onlyArg
    ? [onlyArg.split("=")[1]]
    : DEPARTMENTS;

  let listings = 0;
  let updated = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let failed = 0;

  for (const [index, dept] of departments.entries()) {
    let html: string;
    try {
      html = await fetchHtml(`${BASE_URL}/courses-${dept}.html`);
    } catch {
      failed++;
      continue;
    }

    const parsed = parseDepartmentPage(html);
    listings += parsed.length;

    for (const listing of parsed) {
      const outcome = await applyListing(listing, dryRun);
      if (outcome === "updated") updated++;
      else if (outcome === "unmatched") unmatched++;
      else if (outcome === "ambiguous") ambiguous++;
    }

    if ((index + 1) % 15 === 0 || index === departments.length - 1) {
      console.log(
        `  ${index + 1}/${departments.length} départements — ${updated} courses enrichies`
      );
    }
    await politeDelay(300);
  }

  console.log(
    `\n${listings} annonces lues, ${updated} courses enrichies, ` +
      `${unmatched} sans correspondance, ${ambiguous} ambiguës (ignorées)` +
      (failed ? `, ${failed} pages inaccessibles` : "")
  );

  const fromDetail = await fillFromDetailPages(dryRun);
  if (fromDetail > 0) {
    console.log(`${fromDetail} courses renseignées depuis leur page`);
  }

  if (!dryRun) {
    const [after] = await sql(
      `SELECT
         COUNT(*) FILTER (WHERE federation_id IN (2,3) AND is_active
                          AND categories <> '{}')                       AS fsgt_ufolep_ok,
         COUNT(*) FILTER (WHERE federation_id IN (2,3) AND is_active)   AS fsgt_ufolep,
         COUNT(*) FILTER (WHERE is_active AND categories <> '{}')       AS all_ok,
         COUNT(*) FILTER (WHERE is_active)                              AS all_races
       FROM races`
    );
    console.log(
      `FSGT+UFOLEP avec catégories : ${after.fsgt_ufolep_ok}/${after.fsgt_ufolep} · ` +
        `toutes fédérations : ${after.all_ok}/${after.all_races}`
    );
  }
}

// Only run when invoked directly: this module also exports its parser, and
// importing it must not kick off a full country-wide pass.
/**
 * Wrapped so the run is recorded whichever way it ends — including the way
 * that used to be invisible, where it simply never started.
 */
async function tracked() {
  const run = await startRun(sql, "categories");
  try {
    await main();
    await run.finish(undefined);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

if (process.argv[1]?.endsWith("amivelo-categories.ts")) {
  tracked().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

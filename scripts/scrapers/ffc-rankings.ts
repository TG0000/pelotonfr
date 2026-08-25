/**
 * FFC national rankings ingestion.
 *
 *   npx tsx scripts/scrapers/ffc-rankings.ts [--seasons=2024,2025,2026] [--types=HNATRT,FNATRT]
 *
 * The federation's ranking pages mount a small React app that posts to a public
 * JSON endpoint:
 *
 *   POST https://api.ffc.fr/ajax/v1/classement/
 *        type=HNATRT&saison=2026&index=<page>
 *
 * Each page returns 20 riders with rank, points, UCI ID, name, club and licence
 * category. No authentication, no session — it is the same data the public
 * ranking page shows.
 *
 * Why this matters: race classifications publish points in barely 1% of rows, so
 * the rankings are the only usable source of a rider's standing. They also carry
 * the licence category, which is what a rider actually competes in.
 *
 * Riders are matched on UCI ID, and created when the ranking knows someone we
 * have never seen finish a race.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { politeDelay } from "./utils/http";
import { createSql } from "./utils/db";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const API_URL = "https://api.ffc.fr/ajax/v1/classement/";
const FFC_FEDERATION_ID = 1;

/** Ranking identifiers used by the federation's own pages. */
const DEFAULT_TYPES = ["HNATRT", "FNATRT"] as const;

/**
 * The ranking season runs 1 November to 31 October and is named after the year
 * it ends in, so November 2026 already belongs to season 2027.
 */
export function currentSeason(now = new Date()): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 10 ? year + 1 : year;
}

const DEFAULT_SEASONS = [2026, 2025, 2024, 2023, 2022, 2021];

/** Safety stop: the men's road ranking ends around page 210. */
const MAX_PAGES = 600;

interface RankingRow {
  id?: string;
  nom?: string;
  prenom?: string;
  club?: string;
  categorie?: string;
  nblicence?: number;
  /** Rank. */
  data1?: string;
  /** Points, written with a French decimal comma. */
  data2?: string;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "26559,08" → 26559.08 */
function parsePoints(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseRank(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(
  type: string,
  season: number,
  index: number
): Promise<{ rows: RankingRow[]; more: boolean }> {
  const body = new URLSearchParams({
    type,
    saison: String(season),
    index: String(index),
  });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "PelotonFR/2.0 (+https://pelotonfr.fr; contact@pelotonfr.fr)",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as {
    data?: { classement?: Array<RankingRow | null>; suite?: boolean };
  };

  const raw = json.data?.classement ?? [];
  // The endpoint pads each page with a null entry.
  const rows = raw.filter((r): r is RankingRow => Boolean(r && r.id));

  return { rows, more: Boolean(json.data?.suite) };
}

/**
 * Resolves a whole page's clubs in one statement.
 *
 * Doing this per rider meant three round trips each; at ~4000 riders per season
 * and twelve season/ranking combinations that is hours of pure latency. Batching
 * per page cuts it by a factor of twenty.
 */
async function resolveClubs(
  names: string[],
  cache: Map<string, string>
): Promise<void> {
  const pending = new Map<string, string>();

  for (const raw of names) {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const normalized = normalizeName(cleaned);
    if (!normalized || cache.has(normalized)) continue;
    // A name repeated within the page must appear once: ON CONFLICT cannot
    // affect the same row twice in one statement.
    pending.set(normalized, cleaned);
  }

  if (pending.size === 0) return;

  const normalized = [...pending.keys()];
  const display = [...pending.values()];

  const rows = await sql(
    `INSERT INTO clubs (federation_id, name, normalized_name)
     SELECT $1::smallint, d.name, d.norm
       FROM UNNEST($2::varchar[], $3::varchar[]) AS d(norm, name)
     ON CONFLICT (federation_id, normalized_name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, normalized_name`,
    [FFC_FEDERATION_ID, normalized, display]
  );

  for (const row of rows) {
    cache.set(row.normalized_name as string, row.id as string);
  }
}

/**
 * Upserts a page of riders in one statement.
 *
 * The ranking is authoritative for the licence category, but must never clobber
 * the counters derived from results, so only identity fields are written.
 */
async function upsertRiders(
  rows: RankingRow[],
  clubCache: Map<string, string>,
  riderCache: Map<string, string>
): Promise<void> {
  const uciIds: string[] = [];
  const lastNames: string[] = [];
  const firstNames: (string | null)[] = [];
  const normalized: string[] = [];
  const clubIds: (string | null)[] = [];
  const categories: (string | null)[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const uciId = (row.id ?? "").trim();
    const lastName = (row.nom ?? "").trim();
    if (!uciId || !lastName || seen.has(uciId)) continue;
    seen.add(uciId);

    const firstName = (row.prenom ?? "").trim();
    const clubKey = normalizeName((row.club ?? "").trim());

    uciIds.push(uciId);
    lastNames.push(lastName);
    firstNames.push(firstName || null);
    normalized.push(normalizeName(`${lastName} ${firstName}`));
    clubIds.push(clubCache.get(clubKey) ?? null);
    categories.push((row.categorie ?? "").trim() || null);
  }

  if (uciIds.length === 0) return;

  const inserted = await sql(
    `INSERT INTO riders (uci_id, last_name, first_name, normalized_name, current_club_id, category)
     SELECT * FROM UNNEST($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::uuid[], $6::varchar[])
     ON CONFLICT (uci_id) DO UPDATE SET
       last_name       = EXCLUDED.last_name,
       first_name      = COALESCE(EXCLUDED.first_name, riders.first_name),
       normalized_name = EXCLUDED.normalized_name,
       current_club_id = COALESCE(EXCLUDED.current_club_id, riders.current_club_id),
       category        = COALESCE(EXCLUDED.category, riders.category)
     RETURNING id, uci_id`,
    [uciIds, lastNames, firstNames, normalized, clubIds, categories]
  );

  for (const row of inserted) {
    riderCache.set(row.uci_id as string, row.id as string);
  }
}

async function ingestRanking(
  type: string,
  season: number,
  clubCache: Map<string, string>,
  riderCache: Map<string, string>
): Promise<{ stored: number; pages: number }> {
  let stored = 0;
  let index = 0;
  let more = true;

  while (more && index < MAX_PAGES) {
    let page: { rows: RankingRow[]; more: boolean };
    try {
      page = await fetchPage(type, season, index);
    } catch (err) {
      console.error(
        `    page ${index} failed: ${err instanceof Error ? err.message : String(err)}`
      );
      break;
    }

    if (page.rows.length === 0) break;

    // Three statements per page rather than three per rider.
    await resolveClubs(
      page.rows.map((r) => r.club ?? ""),
      clubCache
    );
    await upsertRiders(page.rows, clubCache, riderCache);

    const uciIds: string[] = [];
    const riderIds: (string | null)[] = [];
    const ranks: (number | null)[] = [];
    const points: (number | null)[] = [];
    const categories: (string | null)[] = [];
    const clubNames: (string | null)[] = [];
    const clubIds: (string | null)[] = [];
    const licences: (number | null)[] = [];
    const seen = new Set<string>();

    for (const row of page.rows) {
      const uciId = (row.id ?? "").trim();
      if (!uciId || seen.has(uciId)) continue;
      const riderId = riderCache.get(uciId);
      if (!riderId) continue;
      seen.add(uciId);

      const clubName = (row.club ?? "").trim();
      uciIds.push(uciId);
      riderIds.push(riderId);
      ranks.push(parseRank(row.data1));
      points.push(parsePoints(row.data2));
      categories.push((row.categorie ?? "").trim() || null);
      clubNames.push(clubName || null);
      clubIds.push(clubCache.get(normalizeName(clubName)) ?? null);
      licences.push(row.nblicence ?? null);
    }

    if (uciIds.length > 0) {
      await sql(
        `INSERT INTO rider_rankings
           (ranking_type, season, uci_id, rider_id, rank, points, category,
            club_name, club_id, licence_count)
         SELECT $1::varchar, $2::smallint, d.*
           FROM UNNEST($3::varchar[], $4::uuid[], $5::int[], $6::numeric[],
                       $7::varchar[], $8::varchar[], $9::uuid[], $10::smallint[]) AS d
         ON CONFLICT (ranking_type, season, uci_id) DO UPDATE SET
           rider_id      = EXCLUDED.rider_id,
           rank          = EXCLUDED.rank,
           points        = EXCLUDED.points,
           category      = EXCLUDED.category,
           club_name     = EXCLUDED.club_name,
           club_id       = EXCLUDED.club_id,
           licence_count = EXCLUDED.licence_count,
           captured_at   = now()`,
        [
          type, season, uciIds, riderIds, ranks, points,
          categories, clubNames, clubIds, licences,
        ]
      );
      stored += uciIds.length;
    }

    more = page.more;
    index++;

    if (index % 25 === 0) console.log(`    ${stored} rows (page ${index})...`);
    await politeDelay(120);
  }

  return { stored, pages: index };
}

/** Refreshes the current/best standing denormalised onto riders. */
async function refreshRiderStandings(): Promise<void> {
  const [latest] = await sql(`SELECT MAX(season) AS s FROM rider_rankings`);
  const currentSeason = Number(latest.s);

  await sql(
    `UPDATE riders r
        SET current_points = c.points,
            current_rank   = c.rank,
            current_season = c.season,
            category       = COALESCE(c.category, r.category)
       FROM rider_rankings c
      WHERE c.rider_id = r.id
        AND c.season = $1::smallint`,
    [currentSeason]
  );

  await sql(
    `UPDATE riders r
        SET best_points = b.points,
            best_rank   = b.rank,
            best_season = b.season
       FROM (
         SELECT DISTINCT ON (rider_id) rider_id, points, rank, season
           FROM rider_rankings
          WHERE rider_id IS NOT NULL AND points IS NOT NULL
          ORDER BY rider_id, points DESC
       ) b
      WHERE b.rider_id = r.id`
  );
}

async function main() {
  const typesArg = process.argv.find((a) => a.startsWith("--types="));
  const seasonsArg = process.argv.find((a) => a.startsWith("--seasons="));

  const types = typesArg
    ? typesArg.split("=")[1].split(",").map((s) => s.trim().toUpperCase())
    : [...DEFAULT_TYPES];
  const seasons = process.argv.includes("--current")
    ? [currentSeason()]
    : seasonsArg
      ? seasonsArg.split("=")[1].split(",").map((s) => Number(s.trim()))
      : DEFAULT_SEASONS;

  const clubCache = new Map<string, string>();
  const riderCache = new Map<string, string>();
  let total = 0;

  for (const type of types) {
    for (const season of seasons) {
      console.log(`${type} ${season}:`);
      const { stored, pages } = await ingestRanking(
        type,
        season,
        clubCache,
        riderCache
      );
      console.log(`  ${stored} riders over ${pages} pages`);
      total += stored;
    }
  }

  console.log("\nRefreshing rider standings...");
  await refreshRiderStandings();

  const [summary] = await sql(
    `SELECT (SELECT COUNT(*) FROM rider_rankings)                       AS rankings,
            (SELECT COUNT(DISTINCT uci_id) FROM rider_rankings)         AS ranked_riders,
            (SELECT COUNT(*) FROM riders WHERE current_points IS NOT NULL) AS with_current,
            (SELECT COUNT(*) FROM riders)                               AS riders`
  );

  console.log(
    `\n${total} ranking rows ingested.\n` +
      `${summary.rankings} rows for ${summary.ranked_riders} distinct riders; ` +
      `${summary.with_current} of ${summary.riders} riders have a current standing.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

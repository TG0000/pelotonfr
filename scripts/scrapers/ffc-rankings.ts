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

/** The ranking season runs 1 November to 31 October. */
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

async function getOrCreateClub(
  name: string,
  cache: Map<string, string>
): Promise<string | null> {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const normalized = normalizeName(cleaned);
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached) return cached;

  const rows = await sql(
    `INSERT INTO clubs (federation_id, name, normalized_name)
     VALUES ($1::smallint, $2::varchar, $3::varchar)
     ON CONFLICT (federation_id, normalized_name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [FFC_FEDERATION_ID, cleaned, normalized]
  );

  const id = rows[0].id as string;
  cache.set(normalized, id);
  return id;
}

/**
 * Upserts the rider behind a ranking row.
 *
 * The ranking is authoritative for the licence category, but must not clobber
 * the result-derived counters, so only identity fields are written here.
 */
async function upsertRider(
  row: RankingRow,
  clubId: string | null,
  cache: Map<string, string>
): Promise<string | null> {
  const uciId = (row.id ?? "").trim();
  const lastName = (row.nom ?? "").trim();
  if (!uciId || !lastName) return null;

  const cached = cache.get(uciId);
  if (cached) return cached;

  const firstName = (row.prenom ?? "").trim();
  const rows = await sql(
    `INSERT INTO riders (uci_id, last_name, first_name, normalized_name, current_club_id, category)
     VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::uuid, $6::varchar)
     ON CONFLICT (uci_id) DO UPDATE SET
       last_name       = EXCLUDED.last_name,
       first_name      = COALESCE(EXCLUDED.first_name, riders.first_name),
       normalized_name = EXCLUDED.normalized_name,
       current_club_id = COALESCE(EXCLUDED.current_club_id, riders.current_club_id),
       category        = COALESCE(EXCLUDED.category, riders.category)
     RETURNING id`,
    [
      uciId,
      lastName,
      firstName || null,
      normalizeName(`${lastName} ${firstName}`),
      clubId,
      (row.categorie ?? "").trim() || null,
    ]
  );

  const id = rows[0].id as string;
  cache.set(uciId, id);
  return id;
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

    for (const row of page.rows) {
      const clubName = (row.club ?? "").trim();
      const clubId = clubName ? await getOrCreateClub(clubName, clubCache) : null;
      const riderId = await upsertRider(row, clubId, riderCache);
      if (!riderId) continue;

      await sql(
        `INSERT INTO rider_rankings
           (ranking_type, season, uci_id, rider_id, rank, points, category,
            club_name, club_id, licence_count)
         VALUES ($1::varchar, $2::smallint, $3::varchar, $4::uuid, $5::int,
                 $6::numeric, $7::varchar, $8::varchar, $9::uuid, $10::smallint)
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
          type,
          season,
          (row.id ?? "").trim(),
          riderId,
          parseRank(row.data1),
          parsePoints(row.data2),
          (row.categorie ?? "").trim() || null,
          clubName || null,
          clubId,
          row.nblicence ?? null,
        ]
      );
      stored++;
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
  const seasons = seasonsArg
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

/**
 * FFC results ingestion.
 *
 *   npx tsx scripts/scrapers/ffc-results.ts [--limit=300] [--force]
 *
 * The FFC renders its classifications client-side from a `resultatsJson` object
 * embedded in the results page. That object carries, per rider: rank, surname,
 * given name, UCI ID, club, time and points. The UCI ID is a stable national
 * identifier, which is what makes it possible to follow a rider across races,
 * seasons and club changes.
 *
 * Results pages are addressed by the same competition code the calendar already
 * gave us, so there is no index to crawl: we simply revisit past races that have
 * no results yet. The trailing slug in the URL is ignored by the server.
 *
 * Only public data is read. Start lists, which sit behind licensee
 * authentication, are deliberately not touched.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { fetchHtml, politeDelay } from "./utils/http";
import { createSql } from "./utils/db";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE_URL = "https://competitions.ffc.fr";
const FFC_FEDERATION_ID = 1;

/** Races older than this are assumed never to get results published. */
const MAX_AGE_DAYS = 400;

/** Wait this long before re-checking a race whose results were not up yet. */
const RETRY_AFTER_DAYS = 3;

const CONCURRENCY = 4;

interface RawResult {
  RANG?: string | null;
  RANG_GLOBAL?: string | null;
  PHASE?: string | null;
  NOM?: string | null;
  PRENOM?: string | null;
  UCIID?: string | null;
  CLUB?: string | null;
  TEMPS?: string | null;
  CATEGORIE_SPECIALE?: string | null;
  POINTS?: string | null;
}

interface RawGrid {
  uid?: string;
  resultats?: RawResult[];
}

/**
 * Pulls the `resultatsJson` object out of the page.
 *
 * It is a JavaScript assignment rather than a JSON document, so the end of the
 * object is found by balancing braces (while ignoring braces inside strings)
 * instead of by regex.
 */
export function extractResultsJson(html: string): RawGrid[] | null {
  const anchor = html.indexOf("resultatsJson");
  if (anchor === -1) return null;

  const start = html.indexOf("{", anchor);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, i + 1)) as {
            grilles?: RawGrid[];
          };
          return parsed.grilles ?? null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * "4657084 VC COMMUNAUTAIRE  HETTANGE" → code 4657084, name "VC COMMUNAUTAIRE HETTANGE".
 * Many entries carry no code at all.
 */
function parseClub(raw: string): { code?: string; name: string } | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const withCode = /^(\d{5,9})\s+(.*)$/.exec(cleaned);
  if (withCode && withCode[2].trim()) {
    return { code: withCode[1], name: withCode[2].trim() };
  }
  return { name: cleaned };
}

function toInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function toNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function getOrCreateClub(
  raw: string,
  cache: Map<string, string>
): Promise<string | null> {
  const parsed = parseClub(raw);
  if (!parsed) return null;

  const normalized = normalizeName(parsed.name);
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached) return cached;

  const rows = await sql(
    `INSERT INTO clubs (federation_id, external_code, name, normalized_name)
     VALUES ($1::smallint, $2::varchar, $3::varchar, $4::varchar)
     ON CONFLICT (federation_id, normalized_name) DO UPDATE SET
       external_code = COALESCE(clubs.external_code, EXCLUDED.external_code)
     RETURNING id`,
    [FFC_FEDERATION_ID, parsed.code ?? null, parsed.name, normalized]
  );

  const id = rows[0].id as string;
  cache.set(normalized, id);
  return id;
}

async function getOrCreateRider(
  result: RawResult,
  clubId: string | null,
  cache: Map<string, string>
): Promise<string | null> {
  const uciId = (result.UCIID ?? "").trim();
  const lastName = (result.NOM ?? "").trim();
  const firstName = (result.PRENOM ?? "").trim();

  // Without a UCI ID two riders sharing a name are indistinguishable, and
  // merging them would silently corrupt every career statistic built on top.
  if (!uciId || !lastName) return null;

  const cached = cache.get(uciId);
  if (cached) return cached;

  const normalized = normalizeName(`${lastName} ${firstName}`);

  const rows = await sql(
    `INSERT INTO riders (uci_id, last_name, first_name, normalized_name, current_club_id)
     VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::uuid)
     ON CONFLICT (uci_id) DO UPDATE SET
       last_name       = EXCLUDED.last_name,
       first_name      = COALESCE(EXCLUDED.first_name, riders.first_name),
       normalized_name = EXCLUDED.normalized_name,
       current_club_id = COALESCE(EXCLUDED.current_club_id, riders.current_club_id)
     RETURNING id`,
    [uciId, lastName, firstName || null, normalized, clubId]
  );

  const id = rows[0].id as string;
  cache.set(uciId, id);
  return id;
}

interface RaceRow {
  id: string;
  competition_code: string;
  year: number;
}

async function ingestRace(
  race: RaceRow,
  clubCache: Map<string, string>,
  riderCache: Map<string, string>
): Promise<{ stored: number; skipped: number; found: boolean }> {
  const url = `${BASE_URL}/resultats/resultat/${race.year}/${race.competition_code}/`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    await sql(`UPDATE races SET results_fetched_at = now() WHERE id = $1::uuid`, [
      race.id,
    ]);
    return { stored: 0, skipped: 0, found: false };
  }

  const grids = extractResultsJson(html);
  if (!grids || grids.length === 0) {
    // Results are simply not published yet; try again in a few days.
    await sql(`UPDATE races SET results_fetched_at = now() WHERE id = $1::uuid`, [
      race.id,
    ]);
    return { stored: 0, skipped: 0, found: false };
  }

  let stored = 0;
  let skipped = 0;

  for (const grid of grids) {
    const gridUid = grid.uid ?? "";
    for (const entry of grid.resultats ?? []) {
      const clubRaw = (entry.CLUB ?? "").trim();
      const clubId = clubRaw ? await getOrCreateClub(clubRaw, clubCache) : null;
      const riderId = await getOrCreateRider(entry, clubId, riderCache);

      if (!riderId) {
        skipped++;
        continue;
      }

      await sql(
        `INSERT INTO race_results
           (race_id, rider_id, grid_uid, category_special, phase,
            rank, rank_global, finish_time, points, club_id, club_name_raw)
         VALUES ($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar,
                 $6::int, $7::int, $8::varchar, $9::numeric, $10::uuid, $11::varchar)
         ON CONFLICT (race_id, rider_id, grid_uid) DO UPDATE SET
           rank             = EXCLUDED.rank,
           rank_global      = EXCLUDED.rank_global,
           finish_time      = EXCLUDED.finish_time,
           points           = EXCLUDED.points,
           category_special = EXCLUDED.category_special,
           phase            = EXCLUDED.phase,
           club_id          = EXCLUDED.club_id,
           club_name_raw    = EXCLUDED.club_name_raw`,
        [
          race.id,
          riderId,
          gridUid,
          (entry.CATEGORIE_SPECIALE ?? "").trim() || null,
          (entry.PHASE ?? "")?.trim() || null,
          toInt(entry.RANG),
          toInt(entry.RANG_GLOBAL),
          (entry.TEMPS ?? "").trim() || null,
          toNumeric(entry.POINTS),
          clubId,
          clubRaw || null,
        ]
      );
      stored++;
    }
  }

  await sql(
    `UPDATE races
        SET has_results = true, results_fetched_at = now(), finisher_count = $2::int
      WHERE id = $1::uuid`,
    [race.id, stored]
  );

  return { stored, skipped, found: true };
}

/** Recomputes the per-rider counters the UI reads. */
async function refreshRiderAggregates(): Promise<void> {
  await sql(
    `UPDATE riders r
        SET result_count  = s.total,
            win_count     = s.wins,
            podium_count  = s.podiums,
            last_raced_on = s.last_date
       FROM (
         SELECT rr.rider_id,
                COUNT(*)                                    AS total,
                COUNT(*) FILTER (WHERE rr.rank = 1)         AS wins,
                COUNT(*) FILTER (WHERE rr.rank BETWEEN 1 AND 3) AS podiums,
                MAX(ra.race_date)                           AS last_date
           FROM race_results rr
           JOIN races ra ON ra.id = rr.race_id
          GROUP BY rr.rider_id
       ) s
      WHERE s.rider_id = r.id
        AND (r.result_count IS DISTINCT FROM s.total
          OR r.win_count IS DISTINCT FROM s.wins
          OR r.podium_count IS DISTINCT FROM s.podiums
          OR r.last_raced_on IS DISTINCT FROM s.last_date)`
  );
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 300;
  const force = process.argv.includes("--force");

  const races = (await sql(
    `SELECT id, competition_code, EXTRACT(YEAR FROM race_date)::int AS year
       FROM races
      WHERE federation_id = $1::smallint
        AND competition_code IS NOT NULL
        AND is_cancelled = false
        AND COALESCE(race_date_end, race_date) < CURRENT_DATE
        AND COALESCE(race_date_end, race_date) > CURRENT_DATE - ($3::int * INTERVAL '1 day')
        AND ($4::boolean OR has_results = false)
        AND ($4::boolean
             OR results_fetched_at IS NULL
             OR results_fetched_at < now() - ($5::int * INTERVAL '1 day'))
      ORDER BY race_date DESC
      LIMIT $2::int`,
    [FFC_FEDERATION_ID, limit, MAX_AGE_DAYS, force, RETRY_AFTER_DAYS]
  )) as unknown as RaceRow[];

  if (races.length === 0) {
    console.log("No races awaiting results.");
    return;
  }

  console.log(`Fetching results for ${races.length} races...\n`);

  const clubCache = new Map<string, string>();
  const riderCache = new Map<string, string>();

  let withResults = 0;
  let withoutResults = 0;
  let totalStored = 0;
  let totalSkipped = 0;

  // Riders and clubs are shared state, so batches run in small parallel groups
  // rather than fully concurrently — this keeps the upserts from racing.
  for (let i = 0; i < races.length; i += CONCURRENCY) {
    const batch = races.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((race) => ingestRace(race, clubCache, riderCache))
    );

    for (const outcome of outcomes) {
      if (outcome.found) withResults++;
      else withoutResults++;
      totalStored += outcome.stored;
      totalSkipped += outcome.skipped;
    }

    const done = Math.min(i + CONCURRENCY, races.length);
    if (done % 40 === 0 || done === races.length) {
      console.log(
        `  ${done}/${races.length} — ${totalStored} results, ${withResults} races with a classification`
      );
    }
    await politeDelay(300);
  }

  await refreshRiderAggregates();

  const [summary] = await sql(
    `SELECT (SELECT COUNT(*) FROM riders)       AS riders,
            (SELECT COUNT(*) FROM race_results) AS results,
            (SELECT COUNT(*) FROM clubs)        AS clubs`
  );

  console.log(
    `\nDone — ${totalStored} results stored, ${withoutResults} races without a published classification` +
      (totalSkipped > 0 ? `, ${totalSkipped} entries skipped (no UCI ID)` : "")
  );
  console.log(
    `Database now holds ${summary.riders} riders, ${summary.results} results, ${summary.clubs} clubs.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

import { sql } from "../index";

/**
 * A rider's identity card and the "who should I watch" analysis.
 *
 * Two data sources meet here, joined on UCI ID:
 *   - race classifications, which give placings and field sizes;
 *   - the federation's public national rankings, which give points, rank and
 *     licence category season by season.
 *
 * The ranking season runs 1 November to 31 October, so a race is attributed to
 * the season it counted towards, not to its calendar year.
 */

/** Maps a race date onto the FFC ranking season it counts towards. */
const SEASON_EXPR = `EXTRACT(YEAR FROM (ra.race_date + INTERVAL '2 months'))::int`;

function toDateStr(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().split("T")[0];
}

function num(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export interface RiderIdentity {
  id: string;
  uciId: string | null;
  lastName: string;
  firstName: string | null;
  category: string | null;
  clubName: string | null;
  resultCount: number;
  winCount: number;
  podiumCount: number;
  lastRacedOn: string | null;
  currentPoints: number | null;
  currentRank: number | null;
  currentSeason: number | null;
  bestPoints: number | null;
  bestRank: number | null;
  bestSeason: number | null;
}

export interface RiderSeason {
  season: number;
  points: number | null;
  rank: number | null;
  category: string | null;
  clubName: string | null;
  races: number;
  wins: number;
  podiums: number;
  topTen: number;
  bestRank: number | null;
}

export interface RiderProfile {
  identity: RiderIdentity;
  seasons: RiderSeason[];
}

function buildIdentity(row: Record<string, unknown>): RiderIdentity {
  return {
    id: row.id as string,
    uciId: (row.uci_id as string) ?? null,
    lastName: row.last_name as string,
    firstName: (row.first_name as string) ?? null,
    category: (row.category as string) ?? null,
    clubName: (row.club_name as string) ?? null,
    resultCount: Number(row.result_count ?? 0),
    winCount: Number(row.win_count ?? 0),
    podiumCount: Number(row.podium_count ?? 0),
    lastRacedOn: toDateStr(row.last_raced_on),
    currentPoints: num(row.current_points),
    currentRank: num(row.current_rank),
    currentSeason: num(row.current_season),
    bestPoints: num(row.best_points),
    bestRank: num(row.best_rank),
    bestSeason: num(row.best_season),
  };
}

const IDENTITY_COLUMNS = `
  r.id, r.uci_id, r.last_name, r.first_name, r.category,
  r.result_count, r.win_count, r.podium_count, r.last_raced_on,
  r.current_points, r.current_rank, r.current_season,
  r.best_points, r.best_rank, r.best_season,
  c.name AS club_name
`;

export async function getRiderIdentity(
  uciId: string
): Promise<RiderIdentity | null> {
  const rows = await sql(
    `SELECT ${IDENTITY_COLUMNS}
       FROM riders r
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE r.uci_id = $1`,
    [uciId]
  );
  return rows[0] ? buildIdentity(rows[0] as Record<string, unknown>) : null;
}

/**
 * The full identity card: one row per season, combining ranking standing with
 * what the rider actually did on the road that year.
 *
 * A season the rider raced but was never ranked still appears, and vice versa —
 * a full outer join, because either half alone tells a misleading story.
 */
export async function getRiderProfile(
  uciId: string
): Promise<RiderProfile | null> {
  const identity = await getRiderIdentity(uciId);
  if (!identity) return null;

  const rows = await sql(
    `WITH racing AS (
       SELECT ${SEASON_EXPR} AS season,
              COUNT(*)                                        AS races,
              COUNT(*) FILTER (WHERE rr.rank = 1)             AS wins,
              COUNT(*) FILTER (WHERE rr.rank BETWEEN 1 AND 3) AS podiums,
              COUNT(*) FILTER (WHERE rr.rank BETWEEN 1 AND 10) AS top_ten,
              MIN(rr.rank) FILTER (WHERE rr.rank IS NOT NULL) AS best_rank
         FROM race_results rr
         JOIN races ra ON ra.id = rr.race_id
        WHERE rr.rider_id = $1
        GROUP BY 1
     ),
     ranked AS (
       SELECT season, points, rank, category, club_name
         FROM rider_rankings
        WHERE rider_id = $1
     )
     SELECT COALESCE(racing.season, ranked.season) AS season,
            ranked.points, ranked.rank, ranked.category, ranked.club_name,
            COALESCE(racing.races, 0)    AS races,
            COALESCE(racing.wins, 0)     AS wins,
            COALESCE(racing.podiums, 0)  AS podiums,
            COALESCE(racing.top_ten, 0)  AS top_ten,
            racing.best_rank
       FROM racing
       FULL OUTER JOIN ranked ON ranked.season = racing.season
      ORDER BY 1 DESC`,
    [identity.id]
  );

  const seasons: RiderSeason[] = rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      season: Number(r.season),
      points: num(r.points),
      rank: num(r.rank),
      category: (r.category as string) ?? null,
      clubName: (r.club_name as string) ?? null,
      races: Number(r.races ?? 0),
      wins: Number(r.wins ?? 0),
      podiums: Number(r.podiums ?? 0),
      topTen: Number(r.top_ten ?? 0),
      bestRank: num(r.best_rank),
    };
  });

  return { identity, seasons };
}

// ============================================================
// Riders to watch
// ============================================================

export type ThreatKind = "in_form" | "returning" | "specialist" | "regular";

export interface RiderToWatch {
  rider: RiderIdentity;
  /** Why this rider is flagged, so the UI can explain itself. */
  kind: ThreatKind;
  /** Editions of this event the rider has ridden. */
  appearances: number;
  /** Best finish at this event. */
  bestRankHere: number | null;
  lastRankHere: number | null;
  lastSeenHere: string | null;
  /** Results in the last 120 days — the "is he racing right now" signal. */
  recentRaces: number;
  recentWins: number;
  recentPodiums: number;
}

/**
 * Riders worth watching at an upcoming race.
 *
 * Starts from who actually rode past editions of the same event, then labels
 * each one from what the federation's rankings and recent results say:
 *
 *   in_form    — riding, and scoring, this season
 *   returning  — clearly stronger in an earlier season than now; someone who has
 *                been away and whose current standing understates them
 *   specialist — modest overall, but consistently good at THIS event
 *   regular    — shows up, without either signal standing out
 *
 * The labels are deliberately explainable rather than a single opaque score:
 * a rider deciding who to mark wants to know why.
 */
export async function getRidersToWatch(
  raceId: string,
  limit = 30
): Promise<RiderToWatch[]> {
  const rows = await sql(
    `WITH target AS (
       SELECT event_id, race_date FROM races WHERE id = $1
     ),
     past_editions AS (
       SELECT ra.id, ra.race_date
         FROM races ra, target t
        WHERE ra.event_id = t.event_id
          AND ra.event_id IS NOT NULL
          AND ra.id <> $1
          AND ra.race_date < t.race_date
     ),
     here AS (
       SELECT rr.rider_id,
              COUNT(DISTINCT pe.race_date)                    AS appearances,
              MIN(rr.rank) FILTER (WHERE rr.rank IS NOT NULL) AS best_rank_here,
              (ARRAY_AGG(rr.rank ORDER BY pe.race_date DESC))[1] AS last_rank_here,
              MAX(pe.race_date)                               AS last_seen_here
         FROM race_results rr
         JOIN past_editions pe ON pe.id = rr.race_id
        GROUP BY rr.rider_id
     ),
     recent AS (
       SELECT rr.rider_id,
              COUNT(*)                                        AS recent_races,
              COUNT(*) FILTER (WHERE rr.rank = 1)             AS recent_wins,
              COUNT(*) FILTER (WHERE rr.rank BETWEEN 1 AND 3) AS recent_podiums
         FROM race_results rr
         JOIN races ra ON ra.id = rr.race_id
        WHERE ra.race_date >= CURRENT_DATE - INTERVAL '120 days'
          AND ra.race_date <= CURRENT_DATE
        GROUP BY rr.rider_id
     )
     SELECT ${IDENTITY_COLUMNS},
            here.appearances, here.best_rank_here, here.last_rank_here, here.last_seen_here,
            COALESCE(recent.recent_races, 0)    AS recent_races,
            COALESCE(recent.recent_wins, 0)     AS recent_wins,
            COALESCE(recent.recent_podiums, 0)  AS recent_podiums
       FROM here
       JOIN riders r ON r.id = here.rider_id
       LEFT JOIN clubs c ON c.id = r.current_club_id
       LEFT JOIN recent ON recent.rider_id = r.id
      ORDER BY
        -- Anyone currently scoring comes first, then past strength, then
        -- affinity with this particular race.
        COALESCE(r.current_points, 0) DESC,
        COALESCE(r.best_points, 0) DESC,
        here.appearances DESC,
        here.best_rank_here ASC NULLS LAST
      LIMIT $2`,
    [raceId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const identity = buildIdentity(r);

    const recentRaces = Number(r.recent_races ?? 0);
    const recentWins = Number(r.recent_wins ?? 0);
    const recentPodiums = Number(r.recent_podiums ?? 0);
    const appearances = Number(r.appearances ?? 0);
    const bestRankHere = num(r.best_rank_here);

    const current = identity.currentPoints ?? 0;
    const best = identity.bestPoints ?? 0;

    let kind: ThreatKind = "regular";
    if (recentRaces > 0 && (recentPodiums > 0 || current > 0)) {
      kind = "in_form";
    } else if (best > 0 && current < best * 0.5) {
      // Was materially stronger in an earlier season than the current one
      // reflects — the rider whose standing understates them.
      kind = "returning";
    } else if (appearances >= 2 && bestRankHere != null && bestRankHere <= 5) {
      kind = "specialist";
    }

    return {
      rider: identity,
      kind,
      appearances,
      bestRankHere,
      lastRankHere: num(r.last_rank_here),
      lastSeenHere: toDateStr(r.last_seen_here),
      recentRaces,
      recentWins,
      recentPodiums,
    };
  });
}

// ============================================================
// Ranking
// ============================================================

export interface RankingEntry {
  rank: number | null;
  points: number | null;
  uciId: string;
  lastName: string;
  firstName: string | null;
  clubName: string | null;
  category: string | null;
}

export interface RankingPage {
  entries: RankingEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  seasons: number[];
  categories: string[];
}

export interface RankingFilters {
  type?: string;
  season?: number;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The national ranking, mirroring what the federation publishes but queryable —
 * filterable by category and searchable by name, which the official page only
 * does one page at a time.
 */
export async function getRanking(
  filters: RankingFilters = {}
): Promise<RankingPage> {
  const {
    type = "HNATRT",
    category = "",
    q = "",
    page = 1,
    pageSize = 50,
  } = filters;

  const seasonRows = await sql(
    `SELECT DISTINCT season FROM rider_rankings WHERE ranking_type = $1 ORDER BY season DESC`,
    [type]
  );
  const seasons = seasonRows.map((r) => Number((r as { season: unknown }).season));
  const season = filters.season ?? seasons[0];

  if (season == null) {
    return {
      entries: [], total: 0, page: 1, pageSize, totalPages: 0,
      seasons: [], categories: [],
    };
  }

  const categoryRows = await sql(
    `SELECT DISTINCT category FROM rider_rankings
      WHERE ranking_type = $1 AND season = $2 AND category IS NOT NULL
      ORDER BY category`,
    [type, season]
  );
  const categories = categoryRows.map(
    (r) => (r as { category: string }).category
  );

  const conditions = ["rr.ranking_type = $1", "rr.season = $2"];
  const params: unknown[] = [type, season];
  let i = 3;

  if (category) {
    conditions.push(`rr.category = $${i}`);
    params.push(category);
    i++;
  }
  if (q.trim()) {
    // Matches on the rider's stored normalised name, so "alencon" finds
    // "Alençon" and a surname alone is enough.
    conditions.push(
      `(ri.normalized_name ILIKE $${i} OR rr.club_name ILIKE $${i} OR rr.uci_id = $${i + 1})`
    );
    params.push(`%${q.trim().toLowerCase()}%`, q.trim());
    i += 2;
  }

  const from = `
    FROM rider_rankings rr
    LEFT JOIN riders ri ON ri.id = rr.rider_id
   WHERE ${conditions.join(" AND ")}`;

  const [countRow] = await sql(`SELECT COUNT(*) AS total ${from}`, params);

  const offset = (page - 1) * pageSize;
  const rows = await sql(
    `SELECT rr.rank, rr.points, rr.uci_id, rr.club_name, rr.category,
            ri.last_name, ri.first_name
     ${from}
      ORDER BY rr.rank ASC NULLS LAST
      LIMIT $${i} OFFSET $${i + 1}`,
    [...params, pageSize, offset]
  );

  const total = Number((countRow as { total: string }).total);

  return {
    entries: rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        rank: num(r.rank),
        points: num(r.points),
        uciId: r.uci_id as string,
        lastName: (r.last_name as string) ?? "",
        firstName: (r.first_name as string) ?? null,
        clubName: (r.club_name as string) ?? null,
        category: (r.category as string) ?? null,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    seasons,
    categories,
  };
}

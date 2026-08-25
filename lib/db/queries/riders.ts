import { sql } from "../index";

/**
 * Rider and competitor queries.
 *
 * Everything here is built on public classifications keyed by UCI ID. Notably,
 * `getLikelyCompetitors` answers "who will I be up against?" without needing a
 * start list at all: it looks at who actually rode the previous editions of the
 * same event. Past participation is a better signal than a start list anyway —
 * it carries form and finishing position, not just intent to show up.
 */

export interface Rider {
  id: string;
  uciId: string | null;
  lastName: string;
  firstName: string | null;
  clubName: string | null;
  resultCount: number;
  winCount: number;
  podiumCount: number;
  lastRacedOn: string | null;
}

export interface RiderResult {
  raceId: string;
  raceName: string;
  raceDate: string;
  city: string | null;
  departmentCode: string | null;
  discipline: string;
  rank: number | null;
  fieldSize: number | null;
  categorySpecial: string | null;
  points: number | null;
  clubName: string | null;
}

function toDateStr(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().split("T")[0];
}

function buildRider(row: Record<string, unknown>): Rider {
  return {
    id: row.id as string,
    uciId: (row.uci_id as string) ?? null,
    lastName: row.last_name as string,
    firstName: (row.first_name as string) ?? null,
    clubName: (row.club_name as string) ?? null,
    resultCount: Number(row.result_count ?? 0),
    winCount: Number(row.win_count ?? 0),
    podiumCount: Number(row.podium_count ?? 0),
    lastRacedOn: toDateStr(row.last_raced_on),
  };
}

/** Normalises a search term the same way rider names are stored. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function searchRiders(query: string, limit = 20): Promise<Rider[]> {
  const normalized = normalizeName(query);
  if (normalized.length < 2) return [];

  const rows = await sql(
    `SELECT r.id, r.uci_id, r.last_name, r.first_name,
            r.result_count, r.win_count, r.podium_count, r.last_raced_on,
            c.name AS club_name
       FROM riders r
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE r.normalized_name % $1
         OR r.normalized_name LIKE $1 || '%'
      ORDER BY similarity(r.normalized_name, $1) DESC, r.result_count DESC
      LIMIT $2`,
    [normalized, limit]
  );
  return rows.map(buildRider);
}

export async function getRiderByUciId(uciId: string): Promise<Rider | null> {
  const rows = await sql(
    `SELECT r.id, r.uci_id, r.last_name, r.first_name,
            r.result_count, r.win_count, r.podium_count, r.last_raced_on,
            c.name AS club_name
       FROM riders r
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE r.uci_id = $1`,
    [uciId]
  );
  return rows[0] ? buildRider(rows[0] as Record<string, unknown>) : null;
}

/**
 * A rider's results, most recent first.
 *
 * `fieldSize` counts the riders classified in the same grid, so a 3rd place is
 * readable — third of eight is not third of ninety.
 */
export async function getRiderResults(
  riderId: string,
  limit = 50
): Promise<RiderResult[]> {
  const rows = await sql(
    `SELECT ra.id AS race_id, ra.name AS race_name, ra.race_date,
            ra.city, ra.department_code, ra.discipline,
            rr.rank, rr.category_special, rr.points,
            c.name AS club_name,
            (SELECT COUNT(*) FROM race_results peer
              WHERE peer.race_id = rr.race_id
                AND peer.grid_uid IS NOT DISTINCT FROM rr.grid_uid) AS field_size
       FROM race_results rr
       JOIN races ra ON ra.id = rr.race_id
       LEFT JOIN clubs c ON c.id = rr.club_id
      WHERE rr.rider_id = $1
      ORDER BY ra.race_date DESC
      LIMIT $2`,
    [riderId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      raceId: r.race_id as string,
      raceName: r.race_name as string,
      raceDate: toDateStr(r.race_date) ?? "",
      city: (r.city as string) ?? null,
      departmentCode: (r.department_code as string) ?? null,
      discipline: r.discipline as string,
      rank: r.rank != null ? Number(r.rank) : null,
      fieldSize: r.field_size != null ? Number(r.field_size) : null,
      categorySpecial: (r.category_special as string) ?? null,
      points: r.points != null ? Number(r.points) : null,
      clubName: (r.club_name as string) ?? null,
    };
  });
}

export interface LikelyCompetitor {
  rider: Rider;
  /** Editions of this event the rider has appeared in. */
  appearances: number;
  bestRank: number | null;
  lastRank: number | null;
  lastSeenOn: string | null;
}

/**
 * Who is likely to line up at an upcoming race.
 *
 * Derived from the previous editions of the same recurring event: local races
 * draw a stable field, so riders who showed up before are the best available
 * predictor — and unlike a start list, each name comes with a track record.
 */
export async function getLikelyCompetitors(
  raceId: string,
  limit = 25
): Promise<LikelyCompetitor[]> {
  const rows = await sql(
    `WITH target AS (
       SELECT event_id, race_date FROM races WHERE id = $1
     ),
     past_editions AS (
       SELECT ra.id
         FROM races ra, target t
        WHERE ra.event_id = t.event_id
          AND ra.event_id IS NOT NULL
          AND ra.id <> $1
          AND ra.race_date < t.race_date
     )
     SELECT r.id, r.uci_id, r.last_name, r.first_name,
            r.result_count, r.win_count, r.podium_count, r.last_raced_on,
            c.name AS club_name,
            COUNT(*)                       AS appearances,
            MIN(rr.rank) FILTER (WHERE rr.rank IS NOT NULL) AS best_rank,
            (ARRAY_AGG(rr.rank ORDER BY ra.race_date DESC))[1] AS last_rank,
            MAX(ra.race_date)              AS last_seen_on
       FROM race_results rr
       JOIN past_editions pe ON pe.id = rr.race_id
       JOIN races ra ON ra.id = rr.race_id
       JOIN riders r ON r.id = rr.rider_id
       LEFT JOIN clubs c ON c.id = r.current_club_id
      GROUP BY r.id, r.uci_id, r.last_name, r.first_name,
               r.result_count, r.win_count, r.podium_count, r.last_raced_on, c.name
      ORDER BY appearances DESC, best_rank ASC NULLS LAST
      LIMIT $2`,
    [raceId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      rider: buildRider(r),
      appearances: Number(r.appearances),
      bestRank: r.best_rank != null ? Number(r.best_rank) : null,
      lastRank: r.last_rank != null ? Number(r.last_rank) : null,
      lastSeenOn: toDateStr(r.last_seen_on),
    };
  });
}

export interface HeadToHead {
  raceId: string;
  raceName: string;
  raceDate: string;
  rankA: number | null;
  rankB: number | null;
}

/** Every race two riders both finished, newest first. */
export async function getHeadToHead(
  riderAId: string,
  riderBId: string,
  limit = 30
): Promise<HeadToHead[]> {
  const rows = await sql(
    `SELECT ra.id AS race_id, ra.name AS race_name, ra.race_date,
            a.rank AS rank_a, b.rank AS rank_b
       FROM race_results a
       JOIN race_results b
         ON b.race_id = a.race_id
        AND b.grid_uid IS NOT DISTINCT FROM a.grid_uid
        AND b.rider_id = $2
       JOIN races ra ON ra.id = a.race_id
      WHERE a.rider_id = $1
      ORDER BY ra.race_date DESC
      LIMIT $3`,
    [riderAId, riderBId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      raceId: r.race_id as string,
      raceName: r.race_name as string,
      raceDate: toDateStr(r.race_date) ?? "",
      rankA: r.rank_a != null ? Number(r.rank_a) : null,
      rankB: r.rank_b != null ? Number(r.rank_b) : null,
    };
  });
}

export interface EventEdition {
  raceId: string;
  raceDate: string;
  name: string;
  finisherCount: number | null;
  winnerName: string | null;
}

/** Past editions of the event a race belongs to, newest first. */
export async function getEventHistory(
  raceId: string,
  limit = 10
): Promise<EventEdition[]> {
  const rows = await sql(
    `WITH target AS (SELECT event_id FROM races WHERE id = $1)
     SELECT ra.id AS race_id, ra.race_date, ra.name, ra.finisher_count,
            (SELECT TRIM(CONCAT(w.last_name, ' ', COALESCE(w.first_name, '')))
               FROM race_results rr
               JOIN riders w ON w.id = rr.rider_id
              WHERE rr.race_id = ra.id AND rr.rank = 1
              LIMIT 1) AS winner_name
       FROM races ra, target t
      WHERE ra.event_id = t.event_id
        AND ra.event_id IS NOT NULL
        AND ra.id <> $1
      ORDER BY ra.race_date DESC
      LIMIT $2`,
    [raceId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      raceId: r.race_id as string,
      raceDate: toDateStr(r.race_date) ?? "",
      name: r.name as string,
      finisherCount: r.finisher_count != null ? Number(r.finisher_count) : null,
      winnerName: (r.winner_name as string) ?? null,
    };
  });
}

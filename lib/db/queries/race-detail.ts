import { sql } from "@/lib/db";

/**
 * What a rider needs in order to decide whether to enter a race, and to arrive
 * knowing what they are riding into.
 */

export interface Entrant {
  bib: string | null;
  lastName: string;
  firstName: string | null;
  club: string | null;
  riderId: string | null;
  uciId: string | null;
  /** National standing, when the entrant was matched to a known rider. */
  rank: number | null;
  points: number | null;
  wins: number;
  results: number;
}

export interface StartList {
  entrants: Entrant[];
  total: number;
  /** How many we could tie to a rider we hold results for. */
  identified: number;
  observedAt: string | null;
  sourceUrl: string | null;
}

/**
 * The published start list, with each entrant's record attached.
 *
 * A name on a list says who is coming. A name with a national ranking and a
 * win count says what that means, which is the difference between a list and
 * a briefing.
 */
export async function getStartList(raceId: string): Promise<StartList | null> {
  const rows = (await sql(
    `SELECT e.bib, e.last_name_raw, e.first_name_raw, e.club_name_raw,
            e.observed_at, e.source_url,
            r.id AS rider_id, r.uci_id, r.current_rank, r.current_points,
            r.win_count, r.result_count,
            c.name AS club_name
       FROM engagements e
       LEFT JOIN riders r ON r.id = e.rider_id
       LEFT JOIN clubs c  ON c.id = e.club_id
      WHERE e.race_id = $1::uuid
      ORDER BY
        -- Ranked riders first: the ones worth knowing about are the point.
        r.current_rank ASC NULLS LAST,
        e.last_name_raw ASC`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  if (rows.length === 0) return null;

  const entrants: Entrant[] = rows.map((row) => ({
    bib: (row.bib as string | null) ?? null,
    lastName: row.last_name_raw as string,
    firstName: (row.first_name_raw as string | null) ?? null,
    club: (row.club_name as string | null) ?? (row.club_name_raw as string | null),
    riderId: (row.rider_id as string | null) ?? null,
    uciId: (row.uci_id as string | null) ?? null,
    rank: row.current_rank === null ? null : Number(row.current_rank),
    points: row.current_points === null ? null : Number(row.current_points),
    wins: Number(row.win_count ?? 0),
    results: Number(row.result_count ?? 0),
  }));

  const first = rows[0];
  return {
    entrants,
    total: entrants.length,
    identified: entrants.filter((e) => e.riderId !== null).length,
    observedAt: first.observed_at ? new Date(first.observed_at as string).toISOString() : null,
    sourceUrl: (first.source_url as string | null) ?? null,
  };
}

export interface PastEdition {
  raceId: string;
  name: string;
  date: string;
  season: number | null;
  starters: number;
  winner: { name: string; club: string | null; uciId: string | null } | null;
}

/**
 * Earlier runnings of the same meeting.
 *
 * This is what the meeting identity exists for. A rider looking at a race
 * wants to know who won it last time and how many turned up — the two
 * questions that say whether it is worth the drive.
 */
export async function getPastEditions(
  raceId: string,
  limit = 6
): Promise<PastEdition[]> {
  const rows = (await sql(
    `WITH me AS (SELECT event_id, race_date FROM races WHERE id = $1::uuid)
     SELECT r.id, r.name, r.race_date::text AS race_date, r.season,
            (SELECT count(*)::int FROM race_results rr WHERE rr.race_id = r.id) AS starters,
            w.last_name, w.first_name, w.uci_id, w.club_name
       FROM races r
       JOIN me ON me.event_id = r.event_id
       LEFT JOIN LATERAL (
         SELECT ri.last_name, ri.first_name, ri.uci_id,
                COALESCE(c.name, rr.club_name_raw) AS club_name
           FROM race_results rr
           LEFT JOIN riders ri ON ri.id = rr.rider_id
           LEFT JOIN clubs c   ON c.id = rr.club_id
          WHERE rr.race_id = r.id AND rr.rank = 1
          LIMIT 1
       ) w ON true
      WHERE r.id <> $1::uuid
        AND r.event_id IS NOT NULL
        AND r.race_date < me.race_date
      ORDER BY r.race_date DESC
      LIMIT $2::int`,
    [raceId, limit]
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    raceId: row.id as string,
    name: row.name as string,
    date: row.race_date as string,
    season: row.season === null ? null : Number(row.season),
    starters: Number(row.starters ?? 0),
    winner: row.last_name
      ? {
          name: `${(row.first_name as string) ?? ""} ${row.last_name as string}`.trim(),
          club: (row.club_name as string | null) ?? null,
          uciId: (row.uci_id as string | null) ?? null,
        }
      : null,
  }));
}

/**
 * The other races of the same meeting on the same day.
 *
 * The federation publishes each category separately, so a rider arriving at a
 * meeting is looking at one of several fields. Showing the siblings is how the
 * page stops pretending each is a standalone event.
 */
export async function getSiblingRaces(
  raceId: string
): Promise<Array<{ id: string; name: string; categories: string[] }>> {
  const rows = (await sql(
    `WITH me AS (SELECT event_id, race_date FROM races WHERE id = $1::uuid)
     SELECT r.id, r.name, r.categories
       FROM races r
       JOIN me ON me.event_id = r.event_id AND me.race_date = r.race_date
      WHERE r.id <> $1::uuid AND r.event_id IS NOT NULL
      ORDER BY r.name`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    categories: (row.categories as string[]) ?? [],
  }));
}

export interface RaceTrace {
  /** [lng, lat, altitude, distanceFromStart] */
  points: Array<[number, number, number, number]>;
  distanceM: number;
  elevationGainM: number;
  minElevationM: number;
  maxElevationM: number;
  bounds: { west: number; south: number; east: number; north: number };
  source: string;
}

/**
 * The course, when a rider has ridden it.
 *
 * Attached to the meeting rather than the single race: the categories of one
 * afternoon almost always share a circuit, so a trace contributed by whoever
 * rode the Open race documents the Access race too.
 */
export async function getRaceTrace(raceId: string): Promise<RaceTrace | null> {
  const rows = (await sql(
    `WITH me AS (SELECT event_id, race_date FROM races WHERE id = $1::uuid)
     SELECT t.points, t.distance_m, t.elevation_gain_m,
            t.min_elevation_m, t.max_elevation_m, t.bounds, t.source
       FROM race_traces t
       JOIN races r ON r.id = t.race_id
       JOIN me ON (r.id = $1::uuid
                   OR (r.event_id = me.event_id AND r.race_date = me.race_date))
      ORDER BY (r.id = $1::uuid) DESC, t.distance_m DESC
      LIMIT 1`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;

  return {
    points: row.points as Array<[number, number, number, number]>,
    distanceM: Number(row.distance_m ?? 0),
    elevationGainM: Number(row.elevation_gain_m ?? 0),
    minElevationM: Number(row.min_elevation_m ?? 0),
    maxElevationM: Number(row.max_elevation_m ?? 0),
    bounds: row.bounds as RaceTrace["bounds"],
    source: String(row.source ?? "strava"),
  };
}

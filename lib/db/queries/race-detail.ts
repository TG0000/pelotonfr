import { toDateOnly } from "@/lib/date";
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
  /** The date of the edition the trace was recorded on. */
  tracedOn: string | null;
  /** False when it comes from another edition of the same meeting. */
  sameDay: boolean;
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
    `WITH me AS (
       SELECT event_id, race_date, discipline, location
         FROM races WHERE id = $1::uuid
     )
     SELECT t.points, t.distance_m, t.elevation_gain_m,
            t.min_elevation_m, t.max_elevation_m, t.bounds, t.source,
            r.race_date::text AS traced_on,
            (r.race_date = me.race_date) AS same_day
       FROM race_traces t
       JOIN races r ON r.id = t.race_id
       CROSS JOIN me
      -- Widening outwards: this race, then any edition of the same meeting,
      -- then any race run from the same place in the same discipline.
      --
      -- The last step matters more than it looks. Meeting identity is built on
      -- the published name, and an organiser who adds "La Route du Roc" one
      -- year splits the meeting in two — while the circuit at Louvigné-du-
      -- Désert is still the circuit at Louvigné-du-Désert. A trace is far more
      -- forgiving than an identity: it describes a road, not an event.
      WHERE r.id = $1::uuid
         OR r.event_id = me.event_id
         OR (r.discipline = me.discipline
             AND me.location IS NOT NULL
             -- Compared against the trace's own centre, not the race row's
             -- location: a race found through the results index has no
             -- coordinates, while the track hanging off it plainly does.
             AND t.centre IS NOT NULL
             AND ST_DWithin(t.centre, me.location, 5000))
      ORDER BY (r.id = $1::uuid) DESC,
               (r.event_id = me.event_id) DESC,
               (r.race_date = me.race_date) DESC,
               r.race_date DESC
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
    tracedOn: (row.traced_on as string | null) ?? null,
    sameDay: Boolean(row.same_day),
  };
}

/**
 * When this meeting has actually started and how long it took, from a ride
 * recorded on it. Beats any estimate, and there is no reason to guess when
 * somebody has already measured.
 */
export async function getMeasuredTiming(
  raceId: string
): Promise<{ startHour: number; durationMinutes: number } | null> {
  const rows = (await sql(
    `WITH me AS (SELECT event_id FROM races WHERE id = $1::uuid)
     SELECT EXTRACT(HOUR FROM a.started_at AT TIME ZONE 'Europe/Paris')
              + EXTRACT(MINUTE FROM a.started_at AT TIME ZONE 'Europe/Paris') / 60.0
              AS start_hour,
            a.moving_time_s
       FROM strava_activities a
       JOIN races r ON r.id = a.race_id
       JOIN me ON r.event_id = me.event_id
      WHERE a.moving_time_s > 1200
      ORDER BY (r.id = $1::uuid) DESC, a.started_at DESC
      LIMIT 1`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;

  return {
    startHour: Number(row.start_hour),
    durationMinutes: Math.round(Number(row.moving_time_s) / 60),
  };
}

export interface FieldLevel {
  /** Editions the reading is based on. */
  editions: number;
  /** Typical number of riders classified. */
  medianClassified: number;
  /** National standing of the strongest rider who has raced it. */
  bestRank: number | null;
  /** Median standing of the ranked riders — the level of the bunch itself. */
  medianRank: number | null;
  /** How many of the field carry a national ranking at all. */
  rankedShare: number;
  /** Average speed, where a ride recorded on the course tells us. */
  averageSpeedKmh: number | null;
  fastestSpeedKmh: number | null;
}

/**
 * How hard this race has actually been.
 *
 * A start list says who is coming; this says what turning up has meant. The
 * median national ranking of the bunch is the honest measure of level — an
 * average is dragged around by one ex-professional in a field of clubmen — and
 * the field size is what tells a rider whether they will be racing or riding.
 *
 * Speed comes from rides recorded on the course, so it is real rather than
 * modelled, and absent until somebody has ridden it.
 */
export async function getFieldLevel(raceId: string): Promise<FieldLevel | null> {
  const rows = (await sql(
    `WITH me AS (SELECT event_id, race_date FROM races WHERE id = $1::uuid),
     past AS (
       SELECT r.id
         FROM races r JOIN me ON r.event_id = me.event_id
        WHERE r.race_date <= me.race_date AND r.event_id IS NOT NULL
     ),
     per_edition AS (
       SELECT rr.race_id, count(*)::int AS classified
         FROM race_results rr WHERE rr.race_id IN (SELECT id FROM past)
        GROUP BY rr.race_id
     ),
     ranked AS (
       SELECT ri.current_rank
         FROM race_results rr
         JOIN riders ri ON ri.id = rr.rider_id
        WHERE rr.race_id IN (SELECT id FROM past) AND ri.current_rank IS NOT NULL
     ),
     rides AS (
       SELECT (a.distance_m / NULLIF(a.moving_time_s, 0)) * 3.6 AS kmh
         FROM strava_activities a
        WHERE a.race_id IN (SELECT id FROM past) AND a.moving_time_s > 1200
     )
     SELECT
       (SELECT count(*)::int FROM per_edition) AS editions,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY classified)
          FROM per_edition) AS median_classified,
       (SELECT min(current_rank)::int FROM ranked) AS best_rank,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY current_rank)
          FROM ranked) AS median_rank,
       (SELECT count(*)::int FROM ranked) AS ranked_count,
       (SELECT COALESCE(sum(classified), 0)::int FROM per_edition) AS total_classified,
       (SELECT round(avg(kmh)::numeric, 1) FROM rides) AS avg_kmh,
       (SELECT round(max(kmh)::numeric, 1) FROM rides) AS max_kmh`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row || Number(row.editions ?? 0) === 0) return null;

  const totalClassified = Number(row.total_classified ?? 0);
  const rankedCount = Number(row.ranked_count ?? 0);

  return {
    editions: Number(row.editions),
    medianClassified: Math.round(Number(row.median_classified ?? 0)),
    bestRank: row.best_rank === null ? null : Number(row.best_rank),
    medianRank: row.median_rank === null ? null : Math.round(Number(row.median_rank)),
    rankedShare: totalClassified > 0 ? rankedCount / totalClassified : 0,
    averageSpeedKmh: row.avg_kmh === null ? null : Number(row.avg_kmh),
    fastestSpeedKmh: row.max_kmh === null ? null : Number(row.max_kmh),
  };
}

export interface RaceClimb {
  segmentId: number;
  name: string;
  distanceM: number;
  averageGrade: number;
  elevationM: number | null;
  climbCategory: number | null;
}

/**
 * The climbs in the sector, as Strava's riders have named them.
 *
 * Not the course itself — these are the difficulties of the ground around the
 * start, which is the best available answer where nobody has yet ridden the
 * race with a computer running. Where a trace exists, it is the better source
 * and this is context beside it.
 */
export async function getRaceClimbs(raceId: string): Promise<RaceClimb[]> {
  const rows = (await sql(
    `SELECT segment_id, name, distance_m, average_grade, elevation_m, climb_category
       FROM race_segments
      WHERE race_id = $1::uuid
      ORDER BY elevation_m DESC NULLS LAST, average_grade DESC
      LIMIT 6`,
    [raceId]
  )) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    segmentId: Number(r.segment_id),
    name: r.name as string,
    distanceM: Number(r.distance_m),
    averageGrade: Number(r.average_grade),
    elevationM: r.elevation_m === null ? null : Number(r.elevation_m),
    climbCategory: r.climb_category === null ? null : Number(r.climb_category),
  }));
}


/**
 * Le classement, une fois la course courue.
 *
 * Quatre cent mille lignes étaient collectées depuis des mois et n'étaient
 * affichées nulle part : la page d'une course passée montrait la météo qu'il
 * avait fait et le peloton qu'on attendait, jamais qui avait gagné. C'est la
 * seule chose qu'on vient y chercher après coup.
 */
export interface ResultRow {
  rank: number | null;
  riderId: string | null;
  uciId: string | null;
  lastName: string;
  firstName: string | null;
  club: string | null;
  points: number | null;
  finishTime: string | null;
}

export async function getRaceResults(
  raceId: string,
  limit = 200
): Promise<ResultRow[]> {
  const rows = await sql(
    `SELECT rr.rank, rr.points, rr.finish_time,
            ri.id AS rider_id, ri.uci_id, ri.last_name, ri.first_name,
            COALESCE(c.name, rr.club_name_raw) AS club
       FROM race_results rr
       LEFT JOIN riders ri ON ri.id = rr.rider_id
       LEFT JOIN clubs c ON c.id = rr.club_id
      WHERE rr.race_id = $1::uuid
      ORDER BY rr.rank NULLS LAST
      LIMIT $2::int`,
    [raceId, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      rank: r.rank != null ? Number(r.rank) : null,
      riderId: (r.rider_id as string) ?? null,
      uciId: (r.uci_id as string) ?? null,
      lastName: (r.last_name as string) ?? "",
      firstName: (r.first_name as string) ?? null,
      club: (r.club as string) ?? null,
      points: r.points != null ? Number(r.points) : null,
      finishTime: (r.finish_time as string) ?? null,
    };
  });
}


/**
 * La course a-t-elle été reprise plus tard ?
 *
 * La fédération ne dit jamais « reportée » : elle marque annulé et republie
 * l'épreuve à une autre date. Vu de la base, c'est deux courses du même
 * rendez-vous à quelques semaines d'écart, dont la première est barrée — ce qui
 * se lit, et évite à un coureur de conclure que sa saison a perdu une course
 * quand elle a seulement changé de jour.
 *
 * Deux mois de fenêtre : au-delà, c'est l'édition suivante, pas un report.
 */
export interface Postponement {
  raceId: string;
  raceDate: string;
  days: number;
}

export async function getPostponement(
  raceId: string
): Promise<Postponement | null> {
  const [row] = await sql(
    `SELECT b.id, b.race_date, b.race_date - a.race_date AS days
       FROM races a
       JOIN races b ON b.event_id = a.event_id
                   AND b.id <> a.id
                   AND b.is_cancelled = false
                   AND b.race_date > a.race_date
                   AND b.race_date - a.race_date BETWEEN 1 AND 60
      WHERE a.id = $1::uuid
        AND a.is_cancelled
        AND a.event_id IS NOT NULL
      ORDER BY b.race_date
      LIMIT 1`,
    [raceId]
  );
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    raceId: r.id as string,
    raceDate: toDateOnly(r.race_date as string | Date) ?? "",
    days: Number(r.days),
  };
}

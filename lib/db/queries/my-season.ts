import { sql } from "@/lib/db";

/**
 * The rider's own season.
 *
 * Everything else in this product is about races; this is the one place that is
 * about a person. It only works once a Clerk account is tied to a rider in the
 * federation's own files, which is what `users.rider_id` records.
 */

export interface RiderMatch {
  id: string;
  uciId: string;
  name: string;
  club: string | null;
  category: string | null;
  departmentCode: string | null;
  results: number;
  wins: number;
  lastRacedOn: string | null;
}

/**
 * Candidates for "this is me".
 *
 * Searched by name because a rider knows their own name and rarely their UCI
 * number by heart. The club and last race date are returned so two riders with
 * the same name can be told apart, which is the whole difficulty.
 */
export async function searchRiders(query: string, limit = 12): Promise<RiderMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const rows = (await sql(
    `SELECT r.id, r.uci_id, r.last_name, r.first_name, r.category,
            r.result_count, r.win_count, r.last_raced_on::text AS last_raced_on,
            c.name AS club_name, c.department_code
       FROM riders r
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE r.normalized_name % $1
         OR r.uci_id = $2
      ORDER BY similarity(r.normalized_name, $1) DESC,
               r.result_count DESC
      LIMIT $3::int`,
    [normalize(trimmed), trimmed.replace(/\s/g, ""), limit]
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    uciId: row.uci_id as string,
    name: `${(row.first_name as string) ?? ""} ${row.last_name as string}`.trim(),
    club: (row.club_name as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    departmentCode: (row.department_code as string | null) ?? null,
    results: Number(row.result_count ?? 0),
    wins: Number(row.win_count ?? 0),
    lastRacedOn: (row.last_raced_on as string | null) ?? null,
  }));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ties a signed-in account to a rider in the federation's files. */
export async function claimRider(userId: string, riderId: string): Promise<void> {
  await sql(
    `UPDATE users u
        SET rider_id = r.id,
            uci_id   = r.uci_id,
            category = COALESCE(r.category, u.category),
            updated_at = now()
       FROM riders r
      WHERE u.id = $1::uuid AND r.id = $2::uuid`,
    [userId, riderId]
  );
}

export async function releaseRider(userId: string): Promise<void> {
  await sql(
    `UPDATE users SET rider_id = NULL, uci_id = NULL, updated_at = now()
      WHERE id = $1::uuid`,
    [userId]
  );
}

export interface SeasonResult {
  raceId: string;
  raceName: string;
  date: string;
  city: string;
  departmentCode: string | null;
  federationSlug: string;
  rank: number | null;
  fieldSize: number;
  points: number | null;
}

export interface UpcomingTarget {
  raceId: string;
  raceName: string;
  date: string;
  city: string;
  departmentCode: string | null;
  federationSlug: string;
  categories: string[];
  /** Whether a start list has been published for it. */
  hasStartList: boolean;
  distanceKm: number | null;
}

export interface MySeason {
  rider: RiderMatch | null;
  season: number;
  results: SeasonResult[];
  targets: UpcomingTarget[];
  ranking: { rank: number | null; points: number | null; season: number | null };
  best: { rank: number | null; points: number | null; season: number | null };
}

/**
 * A rider's year: what they have done and what they are aiming at.
 *
 * The field size is counted rather than stored, because a placing means
 * nothing without it — eighth of twelve and eighth of a hundred and forty are
 * different afternoons.
 */
export async function getMySeason(
  userId: string,
  season: number
): Promise<MySeason | null> {
  const users = (await sql(
    `SELECT u.rider_id, u.home_lat, u.home_lng,
            r.uci_id, r.last_name, r.first_name, r.category,
            r.result_count, r.win_count, r.last_raced_on::text AS last_raced_on,
            r.current_rank, r.current_points, r.current_season,
            r.best_rank, r.best_points, r.best_season,
            c.name AS club_name, c.department_code
       FROM users u
       LEFT JOIN riders r ON r.id = u.rider_id
       LEFT JOIN clubs c  ON c.id = r.current_club_id
      WHERE u.id = $1::uuid`,
    [userId]
  )) as Array<Record<string, unknown>>;

  const row = users[0];
  if (!row) return null;

  const riderId = row.rider_id as string | null;
  const rider: RiderMatch | null = riderId
    ? {
        id: riderId,
        uciId: row.uci_id as string,
        name: `${(row.first_name as string) ?? ""} ${row.last_name as string}`.trim(),
        club: (row.club_name as string | null) ?? null,
        category: (row.category as string | null) ?? null,
        departmentCode: (row.department_code as string | null) ?? null,
        results: Number(row.result_count ?? 0),
        wins: Number(row.win_count ?? 0),
        lastRacedOn: (row.last_raced_on as string | null) ?? null,
      }
    : null;

  const results: SeasonResult[] = riderId
    ? ((await sql(
        `SELECT ra.id, ra.name, ra.race_date::text AS race_date, ra.city,
                ra.department_code, f.slug AS federation_slug,
                rr.rank, rr.points,
                (SELECT count(*)::int FROM race_results x WHERE x.race_id = ra.id) AS field
           FROM race_results rr
           JOIN races ra       ON ra.id = rr.race_id
           JOIN federations f  ON f.id = ra.federation_id
          WHERE rr.rider_id = $1::uuid AND ra.season = $2::smallint
          ORDER BY ra.race_date DESC`,
        [riderId, season]
      )) as Array<Record<string, unknown>>).map((r) => ({
        raceId: r.id as string,
        raceName: r.name as string,
        date: r.race_date as string,
        city: r.city as string,
        departmentCode: (r.department_code as string | null) ?? null,
        federationSlug: r.federation_slug as string,
        rank: r.rank === null ? null : Number(r.rank),
        fieldSize: Number(r.field ?? 0),
        points: r.points === null ? null : Number(r.points),
      }))
    : [];

  // The races the rider marked, which is the closest thing to a stated plan.
  const targets = ((await sql(
    `SELECT ra.id, ra.name, ra.race_date::text AS race_date, ra.city,
            ra.department_code, ra.categories, f.slug AS federation_slug,
            EXISTS (SELECT 1 FROM engagements e WHERE e.race_id = ra.id) AS has_start_list,
            CASE WHEN $2::float8 IS NULL OR ra.location IS NULL THEN NULL
                 ELSE ST_Distance(ra.location,
                        ST_MakePoint($3::float8, $2::float8)::geography) / 1000
            END AS distance_km
       FROM user_favorites uf
       JOIN races ra      ON ra.id = uf.race_id
       JOIN federations f ON f.id = ra.federation_id
      WHERE uf.user_id = $1::uuid
        AND COALESCE(ra.race_date_end, ra.race_date) >= CURRENT_DATE
      ORDER BY ra.race_date ASC
      LIMIT 20`,
    [userId, row.home_lat ?? null, row.home_lng ?? null]
  )) as Array<Record<string, unknown>>).map((r) => ({
    raceId: r.id as string,
    raceName: r.name as string,
    date: r.race_date as string,
    city: r.city as string,
    departmentCode: (r.department_code as string | null) ?? null,
    federationSlug: r.federation_slug as string,
    categories: (r.categories as string[]) ?? [],
    hasStartList: Boolean(r.has_start_list),
    distanceKm: r.distance_km === null ? null : Number(r.distance_km),
  }));

  return {
    rider,
    season,
    results,
    targets,
    ranking: {
      rank: row.current_rank === null ? null : Number(row.current_rank),
      points: row.current_points === null ? null : Number(row.current_points),
      season: row.current_season === null ? null : Number(row.current_season),
    },
    best: {
      rank: row.best_rank === null ? null : Number(row.best_rank),
      points: row.best_points === null ? null : Number(row.best_points),
      season: row.best_season === null ? null : Number(row.best_season),
    },
  };
}

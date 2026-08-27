import { toDateOnly, todayISO } from "@/lib/date";
import { sql } from "../index";
import type { Race, PaginatedRaces, RaceFilters } from "@/types";

const PAGE_SIZE = 24;


function buildRaceFromRow(row: Record<string, unknown>): Race {
  return {
    id: row.id as string,
    externalId: row.external_id as string,
    federationId: row.federation_id as number,
    federationSlug: row.federation_slug as Race["federationSlug"],
    name: row.name as string,
    slug: row.slug as string | null,
    sourceUrl: row.source_url as string | null,
    raceDate: toDateOnly(row.race_date) ?? "",
    raceDateEnd: row.race_date_end ? toDateOnly(row.race_date_end) : null,
    city: row.city as string,
    departmentCode: row.department_code as string | null,
    departmentName: row.department_name as string | null,
    region: row.region as string | null,
    postcode: row.postcode as string | null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    geocodingStatus: row.geocoding_status as Race["geocodingStatus"],
    discipline: row.discipline as Race["discipline"],
    raceType: row.race_type as string | null,
    level: row.level as Race["level"],
    categories: (row.categories as string[]) ?? [],
    gender: (row.gender as Race["gender"]) ?? "mixed",
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    isCancelled: row.is_cancelled as boolean,
    organizer: row.organizer as string | null,
    contactEmail: row.contact_email as string | null,
    contactPhone: row.contact_phone as string | null,
    notes: row.notes as string | null,
    scrapedAt: toDateOnly(row.scraped_at) ?? "",
    createdAt: toDateOnly(row.created_at) ?? "",
    updatedAt: toDateOnly(row.updated_at) ?? "",
    distanceFromUserKm:
      row.distance_from_user_km != null
        ? Number(row.distance_from_user_km)
        : undefined,
  };
}

export async function getRaces(
  filters: Partial<RaceFilters> = {}
): Promise<PaginatedRaces> {
  const {
    fed = [],
    disc = [],
    cat = [],
    dateFrom,
    dateTo,
    lat,
    lng,
    radius = 50,
    q = "",
    page = 1,
    sortBy = "date_asc",
  } = filters;

  const offset = (page - 1) * PAGE_SIZE;
  const today = todayISO();

  /**
   * One list of parameters, appended to as clauses are added.
   *
   * This function used to build its conditions twice — once for the count and
   * once for the page — and then slice the shared array back to what it guessed
   * the count needed. The arithmetic was wrong the moment a location was
   * involved: the WHERE clause referenced four parameters and the count was
   * handed two, so every search with a location threw and the page, catching
   * it, reported "aucune course ne correspond" over a database full of them.
   *
   * Now the filters are built once and both queries share them, with the
   * paging parameters appended only to the one that pages.
   */
  const params: unknown[] = [];
  const where: string[] = ["r.is_cancelled = false", "r.is_active = true"];

  /** Adds a value and returns its placeholder, so no index is ever computed. */
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (fed.length > 0) where.push(`f.slug = ANY(${bind(fed)}::text[])`);
  if (disc.length > 0) where.push(`r.discipline = ANY(${bind(disc)}::text[])`);
  if (cat.length > 0) where.push(`r.categories && ${bind(cat)}::text[]`);

  where.push(
    `COALESCE(r.race_date_end, r.race_date) >= ${bind(dateFrom || today)}::date`
  );
  if (dateTo) where.push(`r.race_date <= ${bind(dateTo)}::date`);

  if (q.trim()) {
    const like = bind(`%${q.trim()}%`);
    where.push(
      `(r.name ILIKE ${like} OR r.city ILIKE ${like} OR r.organizer ILIKE ${like})`
    );
  }

  let distanceSelect = "";
  let distanceOrder = "";
  if (lat != null && lng != null) {
    // Bound once and referenced twice: the same point filters and measures.
    const lngParam = bind(lng);
    const latParam = bind(lat);
    const point = `ST_MakePoint(${lngParam}, ${latParam})::geography`;
    where.push(
      `r.location IS NOT NULL AND ST_DWithin(r.location, ${point}, ${bind(radius * 1000)})`
    );
    distanceSelect = `, ST_Distance(r.location, ${point}) / 1000 AS distance_from_user_km`;
    distanceOrder = "distance_from_user_km,";
  }

  const whereClause = where.join(" AND ");

  const countRows = await sql(
    `SELECT COUNT(*) AS total
       FROM races r
       JOIN federations f ON f.id = r.federation_id
      WHERE ${whereClause}`,
    params
  );

  const pageParams = [...params, PAGE_SIZE, offset];
  const limitParam = `$${pageParams.length - 1}`;
  const offsetParam = `$${pageParams.length}`;

  const rows = await sql(
    `SELECT
       r.*,
       f.slug AS federation_slug,
       ST_X(r.location::geometry) AS lng,
       ST_Y(r.location::geometry) AS lat
       ${distanceSelect}
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${whereClause}
     ORDER BY ${distanceOrder} r.race_date ${sortBy === "date_desc" ? "DESC" : "ASC"}
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    pageParams
  );

  const total = Number((countRows[0] as { total: string }).total);

  return {
    races: rows.map((r) => buildRaceFromRow(r as Record<string, unknown>)),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getRaceById(id: string): Promise<Race | null> {
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE r.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  return buildRaceFromRow(rows[0] as Record<string, unknown>);
}

export async function getUpcomingRaces(limit = 10): Promise<Race[]> {
  const today = todayISO();
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE COALESCE(r.race_date_end, r.race_date) >= $1 AND r.is_cancelled = false AND r.is_active = true
     ORDER BY r.race_date ASC
     LIMIT $2`,
    [today, limit]
  );
  return rows.map((r) => buildRaceFromRow(r as Record<string, unknown>));
}

export async function getRacesForMap(
  filters: Partial<RaceFilters> = {}
): Promise<Race[]> {
  // Returns lightweight race data for map markers (no pagination)
  const { fed = [], disc = [], cat = [], dateFrom, dateTo, lat, lng, radius = 50, q = "" } = filters;
  const today = todayISO();

  const conditions: string[] = [
    "r.is_cancelled = false",
    "r.is_active = true",
    "r.location IS NOT NULL",
  ];
  const params: unknown[] = [];
  let mi = 1;

  if (fed.length > 0) {
    conditions.push(`f.slug = ANY($${mi}::text[])`);
    params.push(fed);
    mi++;
  }
  if (disc.length > 0) {
    conditions.push(`r.discipline = ANY($${mi}::text[])`);
    params.push(disc);
    mi++;
  }
  if (cat.length > 0) {
    conditions.push(`r.categories && $${mi}::text[]`);
    params.push(cat);
    mi++;
  }

  conditions.push(`COALESCE(r.race_date_end, r.race_date) >= $${mi}::date`);
  params.push(dateFrom || today);
  mi++;

  if (dateTo) {
    conditions.push(`r.race_date <= $${mi}::date`);
    params.push(dateTo);
    mi++;
  }
  if (q.trim()) {
    conditions.push(`r.name ILIKE $${mi}`);
    params.push(`%${q.trim()}%`);
    mi++;
  }
  if (lat != null && lng != null) {
    conditions.push(
      `ST_DWithin(r.location, ST_MakePoint($${mi}, $${mi + 1})::geography, $${mi + 2})`
    );
    params.push(lng, lat, radius * 1000);
    mi += 3;
  }

  const rows = await sql(
    `SELECT r.id, r.name, r.race_date, r.city, r.discipline, r.categories, r.level,
            r.federation_id, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.race_date ASC
     LIMIT 2000`,
    params
  );

  return rows.map((r) => buildRaceFromRow(r as Record<string, unknown>));
}

export interface RaceStats {
  total: number;
  thisWeek: number;
  nextMonth: number;
  byFederation: Record<string, number>;
}

export async function getRaceStats(): Promise<RaceStats> {
  const today = todayISO();
  const weekEnd = toDateOnly(new Date(Date.now() + 7 * 86400000)) ?? today;
  const monthEnd = toDateOnly(new Date(Date.now() + 30 * 86400000)) ?? today;

  const rows = await sql(
    `SELECT f.slug AS federation_slug,
       COUNT(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1 AND r.is_cancelled = false AND r.is_active = true) AS fed_count
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     GROUP BY f.slug`,
    [today]
  );

  const [totRow] = await sql(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1 AND r.is_cancelled = false AND r.is_active = true) AS total,
       COUNT(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1 AND r.race_date <= $2 AND r.is_cancelled = false AND r.is_active = true) AS this_week,
       COUNT(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1 AND r.race_date <= $3 AND r.is_cancelled = false AND r.is_active = true) AS next_month
     FROM races r`,
    [today, weekEnd, monthEnd]
  );

  const byFederation: Record<string, number> = {};
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    byFederation[r.federation_slug as string] = Number(r.fed_count);
  }
  const t = totRow as Record<string, unknown>;

  return {
    total: Number(t.total),
    thisWeek: Number(t.this_week),
    nextMonth: Number(t.next_month),
    byFederation,
  };
}

export interface CalendarDay {
  date: string;
  races: Race[];
}

export async function getRacesForCalendar(
  filters: Partial<RaceFilters> = {}
): Promise<CalendarDay[]> {
  const { fed = [], disc = [], cat = [], dateFrom, dateTo } = filters;
  const today = todayISO();
  const threeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const conditions = ["r.is_active = true", "r.is_cancelled = false"];
  const params: unknown[] = [];
  let mi = 1;

  // Parameterized date bounds
  conditions.push(`COALESCE(r.race_date_end, r.race_date) >= $${mi}`);
  params.push(dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : today);
  mi++;

  conditions.push(`r.race_date <= $${mi}`);
  params.push(dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : threeMonths);
  mi++;

  if (fed.length) {
    conditions.push(`f.slug = ANY($${mi})`);
    params.push(fed);
    mi++;
  }
  if (disc.length) {
    conditions.push(`r.discipline = ANY($${mi})`);
    params.push(disc);
    mi++;
  }
  if (cat.length) {
    conditions.push(`r.categories && $${mi}`);
    params.push(cat);
    mi++;
  }

  const rows = await sql(
    `SELECT r.id, r.name, r.race_date, r.race_date_end, r.city, r.department_code,
            r.discipline, r.race_type, r.categories, r.level, r.is_cancelled,
            r.federation_id, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.race_date ASC, r.name ASC
     LIMIT 3000`,
    params
  );

  // Group by date
  const byDate = new Map<string, Race[]>();
  for (const row of rows) {
    const race = buildRaceFromRow(row as Record<string, unknown>);
    const dateKey = race.raceDate;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(race);
  }

  return Array.from(byDate.entries()).map(([date, races]) => ({ date, races }));
}

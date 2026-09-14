import { sql } from "@/lib/db";

/**
 * Les signalements et les lecteurs en ce moment.
 *
 * Le tableau de bord lit ici ; la page course et la balise de vue écrivent.
 */

export const REPORT_KINDS = [
  { value: "circuit", label: "Le circuit affiché n'est pas le bon" },
  { value: "route", label: "La route : gravillons, enrobé, largeur, bas-côtés" },
  { value: "engages", label: "La liste des engagés manque ou est fausse" },
  { value: "horaire", label: "Horaire, dossards ou lieu manquants ou faux" },
  { value: "annulation", label: "Course annulée ou reportée" },
  { value: "categories", label: "Catégories fausses" },
  { value: "autre", label: "Autre chose" },
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number]["value"];

export function isReportKind(value: string): value is ReportKind {
  return REPORT_KINDS.some((k) => k.value === value);
}

export async function createReport(input: {
  raceId: string | null;
  kind: ReportKind;
  message: string | null;
  contact: string | null;
  page: string | null;
  userId: string | null;
}): Promise<void> {
  await sql(
    `INSERT INTO reports (race_id, kind, message, contact, page, user_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)`,
    [input.raceId, input.kind, input.message, input.contact, input.page, input.userId]
  );
}

export interface OpenReport {
  id: string;
  kind: ReportKind;
  message: string | null;
  contact: string | null;
  page: string | null;
  createdAt: string;
  raceId: string | null;
  raceName: string | null;
  raceDate: string | null;
}

export async function getOpenReports(limit = 50): Promise<OpenReport[]> {
  const rows = (await sql(
    `SELECT p.id::text, p.kind, p.message, p.contact, p.page, p.created_at::text,
            p.race_id::text, r.name AS race_name, r.race_date::text
       FROM reports p LEFT JOIN races r ON r.id = p.race_id
      WHERE p.status = 'ouvert'
      ORDER BY p.created_at DESC
      LIMIT $1::int`,
    [limit]
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as ReportKind,
    message: (r.message as string) ?? null,
    contact: (r.contact as string) ?? null,
    page: (r.page as string) ?? null,
    createdAt: r.created_at as string,
    raceId: (r.race_id as string) ?? null,
    raceName: (r.race_name as string) ?? null,
    raceDate: (r.race_date as string) ?? null,
  }));
}

export async function setReportStatus(id: string, status: "traite" | "ignore" | "ouvert"): Promise<void> {
  await sql(
    `UPDATE reports SET status = $2, treated_at = CASE WHEN $2 = 'ouvert' THEN NULL ELSE now() END
      WHERE id = $1::uuid`,
    [id, status]
  );
}

export async function recordPageView(v: {
  path: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  operator?: boolean;
}): Promise<void> {
  await sql(
    `INSERT INTO page_views (path, city, region, country, lat, lng, operator)
     VALUES ($1, $2, $3, $4, $5::float8, $6::float8, $7::boolean)`,
    [v.path, v.city, v.region, v.country, v.lat, v.lng, Boolean(v.operator)]
  );
}

/** Les adresses de l'opérateur, pour le sortir des comptes d'utilisateurs. */
function operatorEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export interface LiveCity {
  city: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  views: number;
  lastSeen: string;
  /** Depuis la dernière vue, en heures — calculé en base, pas au rendu. */
  ageHours: number;
}

/** Qui lit le site depuis une demi-heure, commune par commune. */
export async function getLiveViewers(minutes = 30): Promise<{ cities: LiveCity[]; total: number; paths: Array<{ path: string; views: number }> }> {
  const [cities, totals, paths] = await Promise.all([
    sql(
      `SELECT COALESCE(city, 'Inconnue') AS city, region, avg(lat) AS lat, avg(lng) AS lng,
              count(*) AS views, max(seen_at)::text AS last_seen,
              extract(epoch FROM now() - max(seen_at)) / 3600 AS age_hours
         FROM page_views
        WHERE seen_at > now() - ($1 || ' minutes')::interval AND NOT operator
        GROUP BY 1, 2 ORDER BY views DESC LIMIT 40`,
      [String(minutes)]
    ),
    sql(`SELECT count(*) AS n FROM page_views WHERE seen_at > now() - ($1 || ' minutes')::interval AND NOT operator`, [String(minutes)]),
    sql(
      `SELECT path, count(*) AS views FROM page_views
        WHERE seen_at > now() - ($1 || ' minutes')::interval AND NOT operator
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [String(minutes)]
    ),
  ]);
  return {
    cities: (cities as Array<Record<string, unknown>>).map((c) => ({
      city: c.city as string,
      region: (c.region as string) ?? null,
      lat: c.lat === null ? null : Number(c.lat),
      lng: c.lng === null ? null : Number(c.lng),
      views: Number(c.views),
      lastSeen: c.last_seen as string,
      ageHours: Number(c.age_hours ?? 0),
    })),
    total: Number((totals as Array<Record<string, unknown>>)[0]?.n ?? 0),
    paths: (paths as Array<Record<string, unknown>>).map((p) => ({ path: p.path as string, views: Number(p.views) })),
  };
}

export interface SiteKpis {
  upcoming: number;
  withTrace: number;
  withEntrants: number;
  withBriefing: number;
  withPoster: number;
  withStages: number;
  withoutPlace: number;
  entrants30d: number;
  resultsLast7d: number;
  reportsOpen: number;
  reportsCircuit: number;
  views24h: number;
  views7d: number;
  users: number;
  favourites: number;
}

/** Les chiffres qui disent si le site va bien. */
export async function getSiteKpis(): Promise<SiteKpis> {
  const [r] = (await sql(
    `SELECT
       (SELECT count(*) FROM races WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE AND is_cancelled = false) AS upcoming,
       (SELECT count(*) FROM races r WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE AND EXISTS (SELECT 1 FROM race_traces t WHERE t.race_id = r.id)) AS with_trace,
       (SELECT count(DISTINCT race_id) FROM engagements e JOIN races r ON r.id = e.race_id WHERE COALESCE(r.race_date_end, r.race_date) >= CURRENT_DATE) AS with_entrants,
       (SELECT count(*) FROM races WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE AND briefing_fetched_at IS NOT NULL) AS with_briefing,
       (SELECT count(*) FROM races WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE AND (start_time IS NOT NULL OR circuit_m IS NOT NULL)) AS with_poster,
       (SELECT count(DISTINCT race_id) FROM race_stages) AS with_stages,
       (SELECT count(*) FROM races WHERE COALESCE(race_date_end, race_date) >= CURRENT_DATE AND (location IS NULL OR city ILIKE '%préciser%')) AS without_place,
       (SELECT count(*) FROM engagements WHERE observed_at > now() - interval '30 days') AS entrants_30d,
       (SELECT count(*) FROM races WHERE has_results AND race_date >= CURRENT_DATE - 7) AS results_7d,
       (SELECT count(*) FROM reports WHERE status = 'ouvert') AS reports_open,
       (SELECT count(*) FROM reports WHERE kind = 'circuit') AS reports_circuit,
       (SELECT count(*) FROM page_views WHERE seen_at > now() - interval '24 hours' AND NOT operator) AS views_24h,
       (SELECT count(*) FROM page_views WHERE seen_at > now() - interval '7 days' AND NOT operator) AS views_7d,
       (SELECT count(*) FROM users u WHERE NOT (lower(u.email) = ANY($1::text[]) OR u.alias_emails && $1::text[])) AS users,
       (SELECT count(*) FROM user_favorites f JOIN users u ON u.id = f.user_id
         WHERE NOT (lower(u.email) = ANY($1::text[]) OR u.alias_emails && $1::text[])) AS favourites`,
    [operatorEmails()]
  )) as Array<Record<string, unknown>>;
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    upcoming: n("upcoming"), withTrace: n("with_trace"), withEntrants: n("with_entrants"),
    withBriefing: n("with_briefing"), withPoster: n("with_poster"), withStages: n("with_stages"),
    withoutPlace: n("without_place"), entrants30d: n("entrants_30d"), resultsLast7d: n("results_7d"),
    reportsOpen: n("reports_open"), reportsCircuit: n("reports_circuit"),
    views24h: n("views_24h"), views7d: n("views_7d"), users: n("users"), favourites: n("favourites"),
  };
}

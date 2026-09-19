import { sql } from "../index";
import { todayISO } from "@/lib/date";
import { buildRaceFromRow } from "./races";
import { publicStravaEnabled } from "@/lib/strava/policy";
import type { Race } from "@/types";

/**
 * Les courses lues par département.
 *
 * C'est comme ça qu'un coureur cherche : « course cycliste Sarthe », pas
 * « calendrier FFC ». Une page par département, avec ses courses à venir et
 * ce que le site sait de son histoire, est la page que ce coureur trouve.
 */

export interface DepartmentSummary {
  code: string;
  name: string;
  /** Courses à venir, non annulées. */
  upcoming: number;
  /** Éditions connues, passées comprises. */
  total: number;
  /** Première saison connue. */
  since: number | null;
  /** Courses à venir dont le circuit est connu. */
  withTrace: number;
}

function toSummary(r: Record<string, unknown>): DepartmentSummary {
  return {
    code: String(r.code),
    /* Aucune des courses du département n'a le nom en toutes lettres : on
       affiche le numéro plutôt que « null ». */
    name: r.name != null ? String(r.name) : `Département ${String(r.code)}`,
    upcoming: Number(r.upcoming ?? 0),
    total: Number(r.total ?? 0),
    since: r.since != null ? Number(r.since) : null,
    withTrace: Number(r.with_trace ?? 0),
  };
}

/* Le compte de la page et la liste qu'elle montre doivent compter la même
   chose. L'en-tête exigeait en plus un département en toutes lettres, que la
   fiche FFC ne donne pas toujours : « 7 courses à venir » au-dessus d'une
   liste de dix, et un département entier en 404 quand aucune de ses courses
   n'avait le nom. Le code suffit ; le nom, quand on l'a, sert au titre. */
const SUMMARY_SELECT = `
  SELECT r.department_code AS code,
         min(r.department_name) AS name,
         count(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1::date) AS upcoming,
         count(*) AS total,
         min(extract(year FROM r.race_date))::int AS since,
         count(*) FILTER (WHERE COALESCE(r.race_date_end, r.race_date) >= $1::date
                           AND EXISTS (SELECT 1 FROM race_traces t
                                        WHERE t.race_id = r.id
                                          AND ($2::boolean OR t.source = 'guide'))) AS with_trace
    FROM races r
   WHERE r.is_active = true AND r.department_code IS NOT NULL`;

export async function listDepartments(): Promise<DepartmentSummary[]> {
  const rows = await sql(`${SUMMARY_SELECT} GROUP BY r.department_code ORDER BY r.department_code`, [
    todayISO(),
    publicStravaEnabled(),
  ]);
  return rows.map((r) => toSummary(r as Record<string, unknown>));
}

export async function getDepartment(code: string): Promise<DepartmentSummary | null> {
  const rows = await sql(`${SUMMARY_SELECT} AND r.department_code = $3::varchar GROUP BY r.department_code`, [
    todayISO(),
    publicStravaEnabled(),
    code,
  ]);
  return rows[0] ? toSummary(rows[0] as Record<string, unknown>) : null;
}

export async function getDepartmentRaces(code: string, limit = 60): Promise<Race[]> {
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
       FROM races r
       JOIN federations f ON f.id = r.federation_id
      WHERE r.department_code = $1::varchar
        AND COALESCE(r.race_date_end, r.race_date) >= $2::date
        AND r.is_active = true
      ORDER BY r.race_date ASC
      LIMIT $3::int`,
    [code, todayISO(), limit]
  );
  return rows.map((r) => buildRaceFromRow(r as Record<string, unknown>));
}

/** Les communes qui reviennent le plus, pour dire où ça court. */
export async function getDepartmentTowns(code: string, limit = 8): Promise<string[]> {
  const rows = await sql(
    `SELECT city, count(*) AS n
       FROM races
      WHERE department_code = $1::varchar AND is_active = true
        AND city IS NOT NULL AND city NOT ILIKE '%préciser%'
      GROUP BY city ORDER BY n DESC, city LIMIT $2::int`,
    [code, limit]
  );
  return rows.map((r) => String(r.city));
}

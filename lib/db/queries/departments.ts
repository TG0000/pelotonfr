import { sql } from "../index";
import { todayISO } from "@/lib/date";
import { buildRaceFromRow } from "./races";
import { publicStravaEnabled } from "@/lib/strava/policy";
import { metresBetween } from "@/lib/polyline";
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

export interface NeighbourDepartment {
  code: string;
  name: string;
  upcoming: number;
}

interface DepartmentCentre extends NeighbourDepartment {
  lat: number;
  lng: number;
}

let centresCache: { at: number; rows: DepartmentCentre[] } | null = null;
const CENTRES_TTL_MS = 10 * 60 * 1000;

/**
 * Le centre de gravité des courses de chaque département, calculé une fois.
 *
 * Une agrégation sur toute la table par page de département, c'est une
 * centaine de fois le même calcul : à la construction du site, les quatre-
 * vingt-quinze pages sont rendues à la file et la base a refusé les
 * connexions avant la fin. Une seule lecture, gardée dix minutes, sert tout
 * le monde — et la page se revalide de toute façon toutes les heures.
 */
async function departmentCentres(): Promise<DepartmentCentre[]> {
  if (centresCache && Date.now() - centresCache.at < CENTRES_TTL_MS) return centresCache.rows;
  const rows = (await sql(
    `SELECT department_code AS code,
            min(department_name) AS name,
            ST_Y(ST_Centroid(ST_Collect(location::geometry))) AS lat,
            ST_X(ST_Centroid(ST_Collect(location::geometry))) AS lng,
            count(*) FILTER (WHERE COALESCE(race_date_end, race_date) >= $1::date)::int AS upcoming
       FROM races
      WHERE is_active = true AND department_code IS NOT NULL AND location IS NOT NULL
      GROUP BY department_code`,
    [todayISO()]
  )) as Array<Record<string, unknown>>;
  const centres = rows.map((r) => ({
    code: String(r.code),
    name: r.name != null ? String(r.name) : `Département ${String(r.code)}`,
    lat: Number(r.lat),
    lng: Number(r.lng),
    upcoming: Number(r.upcoming ?? 0),
  }));
  centresCache = { at: Date.now(), rows: centres };
  return centres;
}

/**
 * Les départements d'à côté, calculés sur les courses elles-mêmes.
 *
 * Un coureur qui ne trouve rien chez lui le week-end prochain roule à
 * quarante minutes de là : lui dire « élargissez aux départements voisins »
 * sans lui donner les liens, c'est le renvoyer à sa barre de recherche. Et
 * pour Google, cent pages de département qui ne se citent jamais sont cent
 * culs-de-sac ; reliées entre elles, elles forment le maillage qui les fait
 * remonter sur « course cycliste » suivi d'un nom de département.
 *
 * Le voisinage vient du centre de gravité des courses connues, pas d'une
 * table de frontières à tenir à jour : ce qui compte ici n'est pas de partager
 * une limite administrative, c'est d'être à portée de voiture.
 */
export async function getNeighbourDepartments(code: string, limit = 6): Promise<NeighbourDepartment[]> {
  const centres = await departmentCentres();
  const ici = centres.find((c) => c.code === code);
  if (!ici) return [];
  return centres
    .filter((c) => c.code !== code)
    .map((c) => ({ ...c, d: metresBetween([ici.lat, ici.lng], [c.lat, c.lng]) }))
    /* Un département sans course à venir reste un lien valable, mais il passe
       derrière : on propose d'abord là où il y a quelque chose à courir. */
    .sort((a, b) => Number(a.upcoming === 0) - Number(b.upcoming === 0) || a.d - b.d)
    .slice(0, limit)
    .map(({ code: c, name, upcoming }) => ({ code: c, name, upcoming }));
}

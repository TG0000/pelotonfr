import { sql } from "../index";
import { toDateOnly } from "@/lib/date";
import { seasonBounds, type SeasonResult } from "@/lib/category-rules";

/**
 * Le coureur derrière le compte, et sa saison en résultats.
 *
 * Un compte est relié à un coureur par `users.rider_id` ; sans ce lien, le
 * compteur n'a rien à compter et le dit.
 */
export interface RiderSeason {
  riderId: string;
  firstName: string;
  lastName: string;
  uciId: string | null;
  club: string | null;
  gender: "men" | "women" | null;
  category: string | null;
  cpp: number | null;
  cppRank: number | null;
  season: number;
  results: SeasonResult[];
}

export async function getRiderSeason(userId: string): Promise<RiderSeason | null> {
  const [u] = await sql(
    `SELECT u.rider_id, u.category AS user_category,
            r.first_name, r.last_name, r.uci_id, r.gender, r.category,
            r.current_points, r.current_rank, r.current_season, c.name AS club
       FROM users u
       JOIN riders r ON r.id = u.rider_id
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE u.id = $1::uuid`,
    [userId]
  );
  if (!u) return null;
  const { from, to, season } = seasonBounds();
  const rows = await sql(
    /* Une course, une place. La fédération publie souvent deux grilles pour
       la même épreuve — celle de la catégorie et le scratch — et compter les
       lignes faisait d'un seul dimanche deux victoires et douze points : 251
       coureurs sur-comptés, dont 26 à qui le compteur annonçait une montée
       qu'ils n'avaient pas décrochée. On garde la meilleure place de la
       journée, celle de sa propre grille. */
    `SELECT * FROM (
       SELECT DISTINCT ON (rr.race_id)
              rr.rank, ra.race_date, ra.name, ra.categories,
              (SELECT count(*) FROM race_results x
                WHERE x.race_id = rr.race_id AND x.grid_uid IS NOT DISTINCT FROM rr.grid_uid) AS classified
         FROM race_results rr
         JOIN races ra ON ra.id = rr.race_id
        WHERE rr.rider_id = $1::uuid
          AND ra.race_date >= $2::date AND ra.race_date <= $3::date
          AND ra.discipline = 'route'
        ORDER BY rr.race_id, rr.rank ASC NULLS LAST
     ) une_place_par_course
      ORDER BY race_date DESC`,
    [u.rider_id, from, to]
  );
  return {
    riderId: u.rider_id as string,
    firstName: (u.first_name as string) ?? "",
    lastName: (u.last_name as string) ?? "",
    uciId: (u.uci_id as string) ?? null,
    club: (u.club as string) ?? null,
    gender: (u.gender as "men" | "women") ?? null,
    category: ((u.user_category ?? u.category) as string) ?? null,
    cpp: u.current_points != null && Number(u.current_season) === season ? Number(u.current_points) : null,
    cppRank: u.current_rank != null && Number(u.current_season) === season ? Number(u.current_rank) : null,
    season,
    results: rows.map((r) => ({
      rank: r.rank != null ? Number(r.rank) : null,
      raceDate: toDateOnly(r.race_date as string | Date) ?? "",
      raceName: r.name as string,
      categories: (r.categories as string[]) ?? [],
      classified: Number(r.classified),
    })),
  };
}

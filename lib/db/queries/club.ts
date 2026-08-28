import { sql } from "../index";
import { toDateOnly } from "@/lib/date";

/**
 * Le club, et ce que le responsable doit faire avant que la porte se ferme.
 *
 * Un tableur partagé ne sait pas quand les engagements ferment. C'est la seule
 * chose qui compte, et c'est ce que l'application connaît : 20 h, trois jours
 * avant la course. Une file triée par cette échéance, qui se vide quand le
 * travail est fait, remplace « penser à regarder » par « être prévenu ».
 */

export interface ClubMembership {
  clubId: string;
  clubName: string;
  role: "coureur" | "responsable";
  memberCount: number;
}

export async function getMembership(
  userId: string
): Promise<ClubMembership | null> {
  const [row] = await sql(
    `SELECT m.club_id, m.role, c.name,
            (SELECT COUNT(*) FROM club_members x WHERE x.club_id = m.club_id) AS members
       FROM club_members m
       JOIN clubs c ON c.id = m.club_id
      WHERE m.user_id = $1::uuid`,
    [userId]
  );
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    clubId: r.club_id as string,
    clubName: r.name as string,
    role: r.role as ClubMembership["role"],
    memberCount: Number(r.members ?? 0),
  };
}

export interface WaitingRider {
  userId: string;
  name: string;
  /** Trouvé sur la liste des partants publiée. */
  confirmed: boolean;
}

export interface QueuedRace {
  raceId: string;
  name: string;
  city: string | null;
  raceDate: string;
  /** Quand la porte se ferme, et si la fédération l'a dit ou si on l'a déduit. */
  closesAt: string | null;
  closeIsStated: boolean;
  hoursLeft: number | null;
  riders: WaitingRider[];
  /** Le responsable a dit que c'était fait. */
  handled: boolean;
  /** La liste des partants existe et nomme au moins un des coureurs. */
  startListOut: boolean;
}

/**
 * Ce qui attend le responsable.
 *
 * Une course entre dans la file dès qu'un coureur du club l'a mise en
 * « programmée » — pas « envisagée », qui est une liste de souhaits et pas une
 * demande. Elle en sort quand le responsable dit l'avoir faite, ou quand la
 * course est passée.
 */
export async function getClubQueue(clubId: string): Promise<QueuedRace[]> {
  const rows = await sql(
    `SELECT r.id, r.name, r.city, r.race_date, r.entries_close_at,
            r.entries_close_source,
            (ce.race_id IS NOT NULL) AS handled,
            EXTRACT(EPOCH FROM (r.entries_close_at - now())) / 3600 AS hours_left,
            json_agg(
              json_build_object(
                'userId', u.id,
                'name', COALESCE(u.display_name, ri.first_name || ' ' || ri.last_name, u.email),
                'confirmed', EXISTS (
                  SELECT 1 FROM engagements e
                   WHERE e.race_id = r.id AND e.rider_id = u.rider_id
                )
              ) ORDER BY COALESCE(u.display_name, ri.last_name, u.email)
            ) AS riders
       FROM user_favorites f
       JOIN club_members m ON m.user_id = f.user_id AND m.club_id = $1::uuid
       JOIN users u ON u.id = f.user_id
       LEFT JOIN riders ri ON ri.id = u.rider_id
       JOIN races r ON r.id = f.race_id
       LEFT JOIN club_entries ce ON ce.club_id = $1::uuid AND ce.race_id = r.id
      WHERE f.intent = 'programmee'
        AND r.race_date >= CURRENT_DATE
        AND r.is_cancelled = false
      GROUP BY r.id, r.name, r.city, r.race_date, r.entries_close_at,
               r.entries_close_source, ce.race_id
      ORDER BY r.entries_close_at ASC NULLS LAST, r.race_date ASC`,
    [clubId]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const riders = (r.riders as WaitingRider[]) ?? [];
    return {
      raceId: r.id as string,
      name: r.name as string,
      city: (r.city as string) ?? null,
      raceDate: toDateOnly(r.race_date as string | Date) ?? "",
      closesAt: r.entries_close_at ? String(r.entries_close_at) : null,
      closeIsStated: r.entries_close_source === "fiche",
      hoursLeft: r.hours_left != null ? Number(r.hours_left) : null,
      riders,
      handled: Boolean(r.handled),
      startListOut: riders.some((x) => x.confirmed),
    };
  });
}

/** Le responsable dit avoir engagé. */
export async function markEntered(
  clubId: string,
  raceId: string,
  userId: string
): Promise<void> {
  await sql(
    `INSERT INTO club_entries (club_id, race_id, entered_by)
     VALUES ($1::uuid, $2::uuid, $3::uuid)
     ON CONFLICT (club_id, race_id) DO NOTHING`,
    [clubId, raceId, userId]
  );
}

/** Il s'était trompé de course, ou l'engagement a été refusé. */
export async function unmarkEntered(
  clubId: string,
  raceId: string
): Promise<void> {
  await sql(
    `DELETE FROM club_entries WHERE club_id = $1::uuid AND race_id = $2::uuid`,
    [clubId, raceId]
  );
}

/** Rejoindre un club. Le premier arrivé en est le responsable : un club sans
 *  personne pour engager n'a pas d'intérêt, et il n'y a personne pour l'adouber. */
export async function joinClub(
  userId: string,
  clubId: string
): Promise<ClubMembership["role"]> {
  const [existing] = await sql(
    `SELECT 1 AS present FROM club_members
      WHERE club_id = $1::uuid AND role = 'responsable' LIMIT 1`,
    [clubId]
  );
  const role = existing ? "coureur" : "responsable";

  await sql(
    `INSERT INTO club_members (club_id, user_id, role)
     VALUES ($1::uuid, $2::uuid, $3)
     ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [clubId, userId, role]
  );
  return role;
}

export async function leaveClub(userId: string): Promise<void> {
  await sql(`DELETE FROM club_members WHERE user_id = $1::uuid`, [userId]);
}

/** Les clubs qui ressemblent à ce qu'on cherche, pour en rejoindre un. */
export async function searchClubs(
  query: string,
  limit = 8
): Promise<Array<{ id: string; name: string; departmentCode: string | null }>> {
  if (query.trim().length < 2) return [];
  const rows = await sql(
    `SELECT id, name, department_code
       FROM clubs
      WHERE normalized_name ILIKE $1
      ORDER BY similarity(normalized_name, $2) DESC, name
      LIMIT $3::int`,
    [`%${query.trim().toLowerCase()}%`, query.trim().toLowerCase(), limit]
  );
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      departmentCode: (r.department_code as string) ?? null,
    };
  });
}

import { transaction } from "@/lib/db/transaction";
import { sql } from "../index";
import { toDateOnly } from "@/lib/date";
import { groupOf, isGroup, raceFitsGroups } from "@/lib/groups";

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
            (SELECT COUNT(*) FROM club_members x WHERE x.club_id = m.club_id AND x.verified_at IS NOT NULL) AS members
       FROM club_members m
       JOIN clubs c ON c.id = m.club_id
      WHERE m.user_id = $1::uuid AND m.verified_at IS NOT NULL`,
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
                'name', COALESCE(u.display_name, ri.first_name || ' ' || ri.last_name, 'Un coéquipier'),
                'confirmed', EXISTS (
                  SELECT 1 FROM engagements e
                   WHERE e.race_id = r.id AND e.rider_id = u.rider_id
                )
              ) ORDER BY COALESCE(u.display_name, ri.last_name, 'Un coéquipier')
            ) AS riders
       FROM user_favorites f
       JOIN club_members m ON m.verified_at IS NOT NULL AND m.user_id = f.user_id AND m.club_id = $1::uuid
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

/** Joining only requests access. An operator verifies membership and role. */
export async function joinClub(userId: string, clubId: string): Promise<ClubMembership["role"] | "pending"> {
  return transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1::uuid FOR UPDATE", [userId]);
    const { rows } = await client.query("SELECT club_id,role FROM club_members WHERE user_id=$1::uuid AND verified_at IS NOT NULL", [userId]);
    if (rows[0]) {
      if (rows[0].club_id !== clubId) throw new Error("Quitte ton club actuel avant d’en rejoindre un autre.");
      return rows[0].role as ClubMembership["role"];
    }
    await client.query("INSERT INTO club_members(club_id,user_id,role) VALUES ($1::uuid,$2::uuid,'coureur') ON CONFLICT(club_id,user_id) DO NOTHING", [clubId,userId]);
    return "pending";
  });
}

export async function leaveClub(userId: string): Promise<void> {
  await transaction(async (client) => {
    // Serialize departures of officers in the same club.
    const membership = await client.query("SELECT club_id FROM club_members WHERE user_id=$1::uuid AND verified_at IS NOT NULL", [userId]);
    if (membership.rows[0]) {
      const clubId = membership.rows[0].club_id;
      await client.query("SELECT id FROM clubs WHERE id=$1::uuid FOR UPDATE", [clubId]);
      const members = await client.query("SELECT user_id,role FROM club_members WHERE club_id=$1::uuid AND verified_at IS NOT NULL", [clubId]);
      const me = members.rows.find(row => row.user_id === userId);
      if (me?.role === "responsable" && members.rows.some(row => row.user_id !== userId) && !members.rows.some(row => row.user_id !== userId && row.role === "responsable")) {
        throw new Error("Fais valider un nouveau responsable via Contact avant de quitter le club.");
      }
    }
    await client.query("DELETE FROM club_members WHERE user_id=$1::uuid", [userId]);
  });
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

/* ------------------------------------------------------------------------ */
/* Où vont les coéquipiers                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Un coéquipier, nommé comme on le nomme au départ : « Théo G. ».
 *
 * Le nom vient de sa licence quand il l'a reliée, sinon du nom qu'il s'est
 * donné, sinon rien — et rien vaut mieux qu'une adresse e-mail.
 */
const MATE_NAME_SQL = `
  COALESCE(
    NULLIF(TRIM(CONCAT(rd.first_name, ' ', LEFT(rd.last_name, 1), '.')), '.'),
    NULLIF(u.display_name, ''),
    'un coéquipier'
  )`;

export interface ClubPlan {
  raceId: string;
  raceName: string;
  raceDate: string;
  raceDateEnd: string | null;
  city: string | null;
  departmentCode: string | null;
  federationSlug: string;
  categories: string[];
  /** Ceux qui y vont (programmée) et ceux qui y pensent (envisagée). */
  going: string[];
  considering: string[];
  /** Le lecteur lui-même y est-il ? */
  mine: "programmee" | "envisagee" | null;
  /** La course admet la catégorie du lecteur. */
  fitsMe: boolean;
}

/**
 * Les courses à venir que les membres du club ont mises à leur calendrier.
 *
 * C'est la question qu'on se pose le mardi : « qui va où ce week-end ? » —
 * pour partir ensemble, ou pour choisir la course où l'on sera plusieurs à
 * rouler. Le lecteur voit sa catégorie en premier si on le lui demande.
 */
export async function getClubPlans(
  clubId: string,
  viewerId: string,
  viewerGroups: string[]
): Promise<ClubPlan[]> {
  const rows = (await sql(
    `SELECT r.id::text AS race_id, r.name, r.race_date::text, r.race_date_end::text,
            r.city, r.department_code, f.slug AS federation_slug, r.categories,
            array_remove(array_agg(CASE WHEN uf.intent = 'programmee' AND uf.user_id <> $2::uuid THEN ${MATE_NAME_SQL} END), NULL) AS going,
            array_remove(array_agg(CASE WHEN uf.intent = 'envisagee' AND uf.user_id <> $2::uuid THEN ${MATE_NAME_SQL} END), NULL) AS considering,
            max(CASE WHEN uf.user_id = $2::uuid THEN uf.intent END) AS mine
       FROM user_favorites uf
       JOIN club_members cm ON cm.verified_at IS NOT NULL AND cm.user_id = uf.user_id AND cm.club_id = $1::uuid
       JOIN users u ON u.id = uf.user_id
       LEFT JOIN riders rd ON rd.id = u.rider_id
       JOIN races r ON r.id = uf.race_id
       JOIN federations f ON f.id = r.federation_id
      WHERE COALESCE(r.race_date_end, r.race_date) >= CURRENT_DATE
        AND r.is_cancelled = false
      GROUP BY r.id, f.slug
     HAVING count(*) FILTER (WHERE uf.user_id <> $2::uuid) > 0 OR max(CASE WHEN uf.user_id = $2::uuid THEN 1 END) = 1
      ORDER BY r.race_date, r.name`,
    [clubId, viewerId]
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const categories = (row.categories as string[]) ?? [];
    return {
      raceId: row.race_id as string,
      raceName: row.name as string,
      raceDate: row.race_date as string,
      raceDateEnd: (row.race_date_end as string) ?? null,
      city: (row.city as string) ?? null,
      departmentCode: (row.department_code as string) ?? null,
      federationSlug: row.federation_slug as string,
      categories,
      going: (row.going as string[]) ?? [],
      considering: (row.considering as string[]) ?? [],
      mine: (row.mine as "programmee" | "envisagee" | null) ?? null,
      fitsMe: viewerGroups.length > 0 ? raceFitsGroups(categories, viewerGroups) : true,
    };
  });
}

export interface ClubmatesOnRace {
  clubName: string;
  going: string[];
  considering: string[];
}

/** Les coéquipiers du lecteur qui ont cette course à leur calendrier. */
export async function getClubmatesOnRace(
  raceId: string,
  viewerId: string
): Promise<ClubmatesOnRace | null> {
  const rows = (await sql(
    `SELECT c.name AS club_name, uf.intent, ${MATE_NAME_SQL} AS mate
       FROM club_members me
       JOIN clubs c ON c.id = me.club_id
       JOIN club_members cm ON cm.verified_at IS NOT NULL AND cm.club_id = me.club_id AND cm.user_id <> me.user_id
       JOIN user_favorites uf ON uf.user_id = cm.user_id AND uf.race_id = $1::uuid
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN riders rd ON rd.id = u.rider_id
      WHERE me.user_id = $2::uuid AND me.verified_at IS NOT NULL
      ORDER BY uf.intent, mate`,
    [raceId, viewerId]
  )) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  return {
    clubName: rows[0].club_name as string,
    going: rows.filter((r) => r.intent === "programmee").map((r) => r.mate as string),
    considering: rows.filter((r) => r.intent === "envisagee").map((r) => r.mate as string),
  };
}

/**
 * Les groupes que le lecteur a cochés — à défaut, celui de sa catégorie.
 */
export async function getViewerGroups(userId: string): Promise<string[]> {
  const rows = (await sql(`SELECT groups, category FROM users WHERE id = $1::uuid`, [userId])) as Array<{ groups: string[] | null; category: string | null }>;
  const chosen = (rows[0]?.groups ?? []).filter(isGroup);
  if (chosen.length > 0) return chosen;
  const derived = groupOf(rows[0]?.category ?? null);
  return derived ? [derived] : [];
}

export async function setViewerGroups(userId: string, groups: string[]): Promise<void> {
  await sql(`UPDATE users SET groups = $2::text[] WHERE id = $1::uuid`, [userId, groups.filter(isGroup)]);
}

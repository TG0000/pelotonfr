import { sql } from "../index";
import type { Race } from "@/types";

export async function getOrCreateUser(clerkId: string, email?: string) {
  const rows = await sql(
    `INSERT INTO users (clerk_id, email)
     VALUES ($1, $2)
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [clerkId, email ?? null]
  );
  return rows[0] as { id: string };
}

export async function getUserFavoriteIds(clerkId: string): Promise<string[]> {
  const rows = await sql(
    `SELECT uf.race_id
     FROM user_favorites uf
     JOIN users u ON u.id = uf.user_id
     WHERE u.clerk_id = $1`,
    [clerkId]
  );
  return rows.map((r) => (r as { race_id: string }).race_id);
}

export async function getUserFavorites(clerkId: string): Promise<Race[]> {
  const rows = await sql(
    `SELECT r.*, f.slug AS federation_slug,
            ST_X(r.location::geometry) AS lng,
            ST_Y(r.location::geometry) AS lat
     FROM races r
     JOIN federations f ON f.id = r.federation_id
     JOIN user_favorites uf ON uf.race_id = r.id
     JOIN users u ON u.id = uf.user_id
     WHERE u.clerk_id = $1
     ORDER BY r.race_date ASC`,
    [clerkId]
  );
  return rows as unknown as Race[];
}

export async function addFavorite(clerkId: string, raceId: string) {
  const user = await getOrCreateUser(clerkId);
  await sql(
    `INSERT INTO user_favorites (user_id, race_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [user.id, raceId]
  );
}

export async function removeFavorite(clerkId: string, raceId: string) {
  await sql(
    `DELETE FROM user_favorites uf
     USING users u
     WHERE u.id = uf.user_id AND u.clerk_id = $1 AND uf.race_id = $2`,
    [clerkId, raceId]
  );
}

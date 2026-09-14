import { sql } from "../index";

/** La recherche retenue, telle que le cookie la sérialise, rangée au compte. */
export async function getUserFilters(userId: string): Promise<string | null> {
  const [row] = await sql(`SELECT filters FROM users WHERE id = $1::uuid`, [userId]);
  const v = row?.filters;
  return typeof v === "string" && v ? v : null;
}

export async function setUserFilters(userId: string, filters: string): Promise<void> {
  await sql(`UPDATE users SET filters = $2 WHERE id = $1::uuid`, [userId, filters || null]);
}

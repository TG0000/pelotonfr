import { sql } from "@/lib/db";

/**
 * The rider's own calendar.
 *
 * Two levels, because a rider does two different things with a race they have
 * spotted: shortlist it, and commit to it. A season is built out of the second
 * list; the first is what it is chosen from.
 */

export type RaceIntent = "envisagee" | "programmee";

export const INTENT_LABEL: Record<RaceIntent, string> = {
  envisagee: "Envisagée",
  programmee: "Au programme",
};

/** Every race the rider has marked, and how firmly. */
export async function getPlanIntents(
  userId: string
): Promise<Map<string, RaceIntent>> {
  const rows = (await sql(
    `SELECT race_id, intent FROM user_favorites WHERE user_id = $1::uuid`,
    [userId]
  )) as Array<{ race_id: string; intent: RaceIntent }>;

  return new Map(rows.map((r) => [r.race_id, r.intent]));
}

export async function setIntent(
  userId: string,
  raceId: string,
  intent: RaceIntent
): Promise<void> {
  await sql(
    `INSERT INTO user_favorites (user_id, race_id, intent)
     VALUES ($1::uuid, $2::uuid, $3::varchar)
     ON CONFLICT (user_id, race_id)
     DO UPDATE SET intent = EXCLUDED.intent, updated_at = now()`,
    [userId, raceId, intent]
  );
}

export async function clearIntent(
  userId: string,
  raceId: string
): Promise<void> {
  await sql(
    `DELETE FROM user_favorites WHERE user_id = $1::uuid AND race_id = $2::uuid`,
    [userId, raceId]
  );
}

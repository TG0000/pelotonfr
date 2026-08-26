import { sql } from "../index";

/**
 * Alert rules: "tell me about Open 2 races within 60 km, three weeks ahead".
 *
 * Matching is deliberately done in SQL against the same predicates the race
 * listing uses, so an alert can never surface a race the site itself would not
 * show — a rule that fires on a cancelled or retired race destroys trust faster
 * than one that stays quiet.
 *
 * `alert_deliveries` records what has already been sent, so a race is announced
 * once per rule even though the job runs every night.
 */

export interface AlertRule {
  id: string;
  userId: string;
  label: string | null;
  isActive: boolean;
  federations: string[];
  disciplines: string[];
  categories: string[];
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  leadTimeDays: number;
  channel: string;
  lastRunAt: string | null;
  /** Races currently matching, for the "you would receive N races" preview. */
  matchCount?: number;
}

export interface AlertMatch {
  raceId: string;
  name: string;
  raceDate: string;
  city: string | null;
  departmentCode: string | null;
  discipline: string;
  federationSlug: string;
  distanceKm: number | null;
}

function toDateStr(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().split("T")[0];
}

function buildRule(row: Record<string, unknown>): AlertRule {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    label: (row.label as string) ?? null,
    isActive: Boolean(row.is_active),
    federations: (row.federations as string[]) ?? [],
    disciplines: (row.disciplines as string[]) ?? [],
    categories: (row.categories as string[]) ?? [],
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    radiusKm: Number(row.radius_km ?? 50),
    leadTimeDays: Number(row.lead_time_days ?? 21),
    channel: (row.channel as string) ?? "email",
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    matchCount: row.match_count != null ? Number(row.match_count) : undefined,
  };
}

const RULE_COLUMNS = `
  r.id, r.user_id, r.label, r.is_active, r.federations, r.disciplines,
  r.categories, r.radius_km, r.lead_time_days, r.channel, r.last_run_at,
  ST_Y(r.center::geometry) AS lat,
  ST_X(r.center::geometry) AS lng
`;

/**
 * Resolves a Clerk identity to our own user row, recording the email.
 *
 * The email is needed to deliver anything, and Clerk is its source of truth, so
 * it is refreshed on every call rather than captured once at signup.
 */
export async function resolveUser(
  clerkId: string,
  email?: string | null
): Promise<string> {
  const rows = await sql(
    `INSERT INTO users (clerk_id, email)
     VALUES ($1::varchar, $2::varchar)
     ON CONFLICT (clerk_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email)
     RETURNING id`,
    [clerkId, email ?? null]
  );
  return rows[0].id as string;
}

export async function getUserAlertRules(userId: string): Promise<AlertRule[]> {
  const rows = await sql(
    `SELECT ${RULE_COLUMNS} FROM alert_rules r
      WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows.map((row) => buildRule(row as Record<string, unknown>));
}

export interface AlertRuleInput {
  label?: string | null;
  federations?: string[];
  disciplines?: string[];
  categories?: string[];
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  leadTimeDays?: number;
  channel?: string;
}

export async function createAlertRule(
  userId: string,
  input: AlertRuleInput
): Promise<AlertRule> {
  const rows = await sql(
    `INSERT INTO alert_rules
       (user_id, label, federations, disciplines, categories,
        center, radius_km, lead_time_days, channel)
     VALUES ($1::uuid, $2::varchar, $3::text[], $4::text[], $5::text[],
             CASE WHEN $6::float8 IS NULL OR $7::float8 IS NULL THEN NULL
                  ELSE ST_MakePoint($7::float8, $6::float8)::geography END,
             $8::int, $9::int, $10::varchar)
     RETURNING ${RULE_COLUMNS.replace(/r\./g, "")}`,
    [
      userId,
      input.label ?? null,
      input.federations ?? [],
      input.disciplines ?? [],
      input.categories ?? [],
      input.lat ?? null,
      input.lng ?? null,
      input.radiusKm ?? 50,
      input.leadTimeDays ?? 21,
      input.channel ?? "email",
    ]
  );
  return buildRule(rows[0] as Record<string, unknown>);
}

export async function deleteAlertRule(
  userId: string,
  ruleId: string
): Promise<boolean> {
  const rows = await sql(
    `DELETE FROM alert_rules WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
    [ruleId, userId]
  );
  return rows.length > 0;
}

export async function setAlertRuleActive(
  userId: string,
  ruleId: string,
  isActive: boolean
): Promise<boolean> {
  const rows = await sql(
    `UPDATE alert_rules SET is_active = $3::boolean
      WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
    [ruleId, userId, isActive]
  );
  return rows.length > 0;
}

/**
 * Races a rule currently matches.
 *
 * `onlyUndelivered` is what the nightly job uses; the settings page calls it
 * without, so a rider can see what a rule would bring before subscribing to it.
 */
export async function getRuleMatches(
  ruleId: string,
  options: { onlyUndelivered?: boolean; limit?: number } = {}
): Promise<AlertMatch[]> {
  const { onlyUndelivered = false, limit = 50 } = options;

  const rows = await sql(
    `WITH rule AS (SELECT * FROM alert_rules WHERE id = $1::uuid)
     SELECT ra.id AS race_id, ra.name, ra.race_date, ra.city,
            ra.department_code, ra.discipline, f.slug AS federation_slug,
            CASE WHEN rule.center IS NULL OR ra.location IS NULL THEN NULL
                 ELSE ST_Distance(ra.location, rule.center) / 1000 END AS distance_km
       FROM races ra
       JOIN federations f ON f.id = ra.federation_id
       JOIN rule ON true
      WHERE ra.is_active
        AND NOT ra.is_cancelled
        AND ra.race_date >= CURRENT_DATE
        AND ra.race_date <= CURRENT_DATE + (rule.lead_time_days * INTERVAL '1 day')
        AND (rule.federations = '{}' OR f.slug = ANY(rule.federations))
        AND (rule.disciplines = '{}' OR ra.discipline = ANY(rule.disciplines))
        AND (rule.categories = '{}' OR ra.categories && rule.categories)
        AND (
          rule.center IS NULL
          OR (ra.location IS NOT NULL
              AND ST_DWithin(ra.location, rule.center, rule.radius_km * 1000))
        )
        AND ($2::boolean = false OR NOT EXISTS (
              SELECT 1 FROM alert_deliveries d
               WHERE d.rule_id = rule.id AND d.race_id = ra.id))
      ORDER BY ra.race_date, distance_km NULLS LAST
      LIMIT $3::int`,
    [ruleId, onlyUndelivered, limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      raceId: r.race_id as string,
      name: r.name as string,
      raceDate: toDateStr(r.race_date) ?? "",
      city: (r.city as string) ?? null,
      departmentCode: (r.department_code as string) ?? null,
      discipline: r.discipline as string,
      federationSlug: r.federation_slug as string,
      distanceKm: r.distance_km != null ? Number(r.distance_km) : null,
    };
  });
}

/** Active rules with a channel that can actually deliver. */
export async function getDeliverableRules(): Promise<
  Array<AlertRule & { email: string | null; displayName: string | null }>
> {
  const rows = await sql(
    `SELECT ${RULE_COLUMNS}, u.email, u.display_name
       FROM alert_rules r
       JOIN users u ON u.id = r.user_id
      WHERE r.is_active
        AND u.email IS NOT NULL
      ORDER BY r.user_id`
  );
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...buildRule(r),
      email: (r.email as string) ?? null,
      displayName: (r.display_name as string) ?? null,
    };
  });
}

/** Records what was sent, so tomorrow's run does not repeat it. */
export async function markDelivered(
  ruleId: string,
  raceIds: string[]
): Promise<void> {
  if (raceIds.length === 0) return;
  await sql(
    `INSERT INTO alert_deliveries (rule_id, race_id)
     SELECT $1::uuid, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [ruleId, raceIds]
  );
  await sql(`UPDATE alert_rules SET last_run_at = now() WHERE id = $1::uuid`, [
    ruleId,
  ]);
}

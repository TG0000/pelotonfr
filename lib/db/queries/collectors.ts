import { sql } from "@/lib/db";
import {
  COLLECTORS,
  describeAge,
  verdictFor,
  type CollectorHealth,
} from "@/lib/collectors";

interface Row {
  collector: string;
  last_success_at: string | null;
  last_status: string | null;
  last_error: string | null;
  items_seen: number | null;
  items_written: number | null;
}

/**
 * How each collector is doing.
 *
 * Reads the last *successful* run separately from the last run of any kind: a
 * collector that has been failing for a week should report both the age of the
 * good data and the reason it has stopped improving.
 */
export async function getCollectorHealth(): Promise<CollectorHealth[]> {
  const rows = (await sql(
    `WITH last_success AS (
       SELECT DISTINCT ON (collector)
              collector, finished_at, items_seen, items_written
       FROM collector_runs
       WHERE status IN ('success', 'partial')
       ORDER BY collector, finished_at DESC NULLS LAST
     ),
     last_any AS (
       SELECT DISTINCT ON (collector) collector, status, error_message
       FROM collector_runs
       ORDER BY collector, started_at DESC
     )
     SELECT COALESCE(s.collector, a.collector) AS collector,
            s.finished_at   AS last_success_at,
            a.status        AS last_status,
            a.error_message AS last_error,
            s.items_seen    AS items_seen,
            s.items_written AS items_written
     FROM last_success s
     FULL OUTER JOIN last_any a ON a.collector = s.collector`
  )) as unknown as Row[];

  const byKey = new Map(rows.map((r) => [r.collector, r]));
  const now = Date.now();

  return COLLECTORS.map((spec) => {
    const row = byKey.get(spec.key);
    const lastSuccessAt = row?.last_success_at
      ? new Date(row.last_success_at).toISOString()
      : null;
    const ageHours = lastSuccessAt
      ? (now - new Date(lastSuccessAt).getTime()) / 3_600_000
      : null;

    return {
      ...spec,
      lastSuccessAt,
      lastStatus: row?.last_status ?? null,
      lastError: row?.last_error ?? null,
      itemsSeen: row?.items_seen ?? null,
      itemsWritten: row?.items_written ?? null,
      ageHours,
      verdict: verdictFor(spec, ageHours),
    };
  });
}

/** The single line the interface shows: how old the calendar itself is. */
export async function getDataFreshness(): Promise<{
  label: string;
  verdict: "ok" | "late" | "overdue" | "never";
}> {
  const health = await getCollectorHealth();
  const calendars = health.filter((h) => h.key.startsWith("calendar-"));
  const worst = calendars.reduce<CollectorHealth | null>(
    (acc, h) => (acc === null || (h.ageHours ?? Infinity) > (acc.ageHours ?? Infinity) ? h : acc),
    null
  );
  return {
    label: describeAge(worst?.ageHours ?? null),
    verdict: worst?.verdict ?? "never",
  };
}

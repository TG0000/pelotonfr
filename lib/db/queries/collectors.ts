import { sql } from "@/lib/db";
import {
  COLLECTORS,
  describeAge,
  shortfallFor,
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
  seen_week: number | null;
  written_week: number | null;
  runs_week: number | null;
}

/**
 * Où en est chaque collecteur.
 *
 * Trois lectures, parce qu'elles disent trois choses différentes. Le dernier
 * passage réussi donne l'âge des données. Le dernier passage tout court donne
 * la raison d'un arrêt : un collecteur en échec depuis une semaine doit dire
 * à la fois que ses données ont sept jours et pourquoi elles n'avancent plus.
 * Et la semaine écoulée donne le rendement, seule mesure qui ait un sens pour
 * un collecteur qui ouvre mille fiches pour en retenir trente — « 34 sur
 * 1 393 » n'y est pas un écart, c'est le métier, et le marquer en rouge
 * chaque nuit n'apprend qu'à ignorer le rouge.
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
     ),
     week AS (
       SELECT collector,
              SUM(items_seen)::int    AS seen_week,
              SUM(items_written)::int AS written_week,
              COUNT(*)::int           AS runs_week
       FROM collector_runs
       WHERE started_at >= now() - INTERVAL '7 days'
         AND status IN ('success', 'partial')
       GROUP BY collector
     )
     SELECT COALESCE(s.collector, a.collector, w.collector) AS collector,
            s.finished_at   AS last_success_at,
            a.status        AS last_status,
            a.error_message AS last_error,
            s.items_seen    AS items_seen,
            s.items_written AS items_written,
            w.seen_week, w.written_week, w.runs_week
     FROM last_success s
     FULL OUTER JOIN last_any a ON a.collector = s.collector
     FULL OUTER JOIN week w ON w.collector = COALESCE(s.collector, a.collector)`
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
    const week = {
      seen: row?.seen_week ?? 0,
      written: row?.written_week ?? 0,
    };

    return {
      ...spec,
      lastSuccessAt,
      lastStatus: row?.last_status ?? null,
      lastError: row?.last_error ?? null,
      itemsSeen: row?.items_seen ?? null,
      itemsWritten: row?.items_written ?? null,
      seenWeek: week.seen,
      writtenWeek: week.written,
      runsWeek: row?.runs_week ?? 0,
      ageHours,
      verdict: verdictFor(spec, ageHours, row?.last_status ?? null),
      shortfall: shortfallFor(
        spec.kind,
        { seen: row?.items_seen ?? null, written: row?.items_written ?? null },
        week
      ),
    };
  });
}

/** La seule ligne que l'interface montre : l'âge du calendrier lui-même. */
export async function getDataFreshness(): Promise<{
  label: string;
  verdict: CollectorHealth["verdict"];
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

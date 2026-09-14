import { sql } from "../index";

export interface TraceCheck {
  id: string;
  raceId: string | null;
  raceName: string | null;
  raceDate: string | null;
  checkedAt: string;
  oldSource: string | null;
  newSource: string | null;
  overlap: number | null;
  verdict: string;
  reason: string | null;
}

/** Les vérifications de circuit, les fausses d'abord. */
export async function getTraceChecks(limit = 40): Promise<TraceCheck[]> {
  const rows = await sql(
    `SELECT c.id, c.race_id, r.name, r.race_date::text AS race_date, c.checked_at::text AS checked_at,
            c.old_source, c.new_source, c.overlap, c.verdict, c.reason
       FROM trace_checks c LEFT JOIN races r ON r.id = c.race_id
      ORDER BY (c.verdict = 'faux') DESC, (c.verdict = 'douteux') DESC, c.checked_at DESC
      LIMIT $1::int`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id as string,
    raceId: (r.race_id as string) ?? null,
    raceName: (r.name as string) ?? null,
    raceDate: (r.race_date as string) ?? null,
    checkedAt: r.checked_at as string,
    oldSource: (r.old_source as string) ?? null,
    newSource: (r.new_source as string) ?? null,
    overlap: r.overlap != null ? Number(r.overlap) : null,
    verdict: r.verdict as string,
    reason: (r.reason as string) ?? null,
  }));
}

export async function countTraceChecks(): Promise<{ faux: number; confirme: number; echauffement: number; audit: number; douteux: number }> {
  const rows = await sql(`SELECT verdict, count(*) AS n FROM trace_checks GROUP BY verdict`);
  const out = { faux: 0, confirme: 0, echauffement: 0, audit: 0, douteux: 0 };
  for (const r of rows) {
    const k = r.verdict as keyof typeof out;
    if (k in out) out[k] = Number(r.n);
  }
  return out;
}

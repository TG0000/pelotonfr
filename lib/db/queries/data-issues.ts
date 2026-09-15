import { sql } from "../index";

export interface DataIssue {
  check: string;
  found: number;
  fixed: number;
  sample: Array<Record<string, unknown>>;
  note: string | null;
  runAt: string;
}

/** Le dernier passage du garde-fou, un contrôle par ligne. */
export async function getLatestDataIssues(): Promise<DataIssue[]> {
  const rows = await sql(
    `SELECT DISTINCT ON (check_name) check_name, found, fixed, sample, note, run_at::text AS run_at
       FROM data_issues ORDER BY check_name, run_at DESC`
  );
  return rows
    .map((r) => ({
      check: r.check_name as string,
      found: Number(r.found),
      fixed: Number(r.fixed),
      sample: (r.sample as Array<Record<string, unknown>>) ?? [],
      note: (r.note as string) ?? null,
      runAt: r.run_at as string,
    }))
    .sort((a, b) => b.found - b.fixed - (a.found - a.fixed));
}

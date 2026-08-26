/**
 * Records what a collector did, so that silence becomes visible.
 *
 * The nightly job went 73 days without running and nothing noticed, because
 * the only signal was a workflow's exit code — and a workflow that never
 * starts never fails. Every collector now opens a row when it begins and
 * closes it when it ends, which turns "no news" into a measurable age.
 */

import type { SqlFn } from "../scrapers/utils/db";

export interface RunTotals {
  /** What the source offered this run. */
  seen?: number;
  /** What we managed to keep. A large gap between the two is the interesting
      case: a run that sees 263 start lists and stores 30 exits zero. */
  written?: number;
  metadata?: Record<string, unknown>;
}

export interface RunHandle {
  finish(totals?: RunTotals): Promise<void>;
  fail(error: unknown, totals?: RunTotals): Promise<void>;
}

export async function startRun(
  sql: SqlFn,
  collector: string
): Promise<RunHandle> {
  let id: string | null = null;
  try {
    const rows = (await sql(
      `INSERT INTO collector_runs (collector) VALUES ($1) RETURNING id`,
      [collector]
    )) as Array<{ id: string }>;
    id = rows[0]?.id ?? null;
  } catch (err) {
    // Tracking must never be the reason a collection fails.
    console.warn(`Could not open a run row for ${collector}:`, err);
  }

  async function close(
    status: "success" | "partial" | "failed",
    totals: RunTotals | undefined,
    errorMessage: string | null
  ) {
    if (id === null) return;
    try {
      await sql(
        `UPDATE collector_runs
            SET finished_at = now(), status = $2,
                items_seen = $3, items_written = $4,
                error_message = $5, metadata = $6
          WHERE id = $1`,
        [
          id,
          status,
          totals?.seen ?? 0,
          totals?.written ?? 0,
          errorMessage,
          totals?.metadata ? JSON.stringify(totals.metadata) : null,
        ]
      );
    } catch (err) {
      console.warn(`Could not close the run row for ${collector}:`, err);
    }
  }

  return {
    async finish(totals) {
      // Seeing plenty and keeping little is worth flagging as partial rather
      // than reporting a clean success.
      const seen = totals?.seen ?? 0;
      const written = totals?.written ?? 0;
      const shortfall = seen > 20 && written < seen * 0.25;
      await close(shortfall ? "partial" : "success", totals, null);
    },
    async fail(error, totals) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      await close("failed", totals, message.slice(0, 2000));
    },
  };
}

/** Wraps a collector so it always reports, whichever way it ends. */
export async function trackRun<T extends RunTotals | void>(
  sql: SqlFn,
  collector: string,
  fn: () => Promise<T>
): Promise<T> {
  const run = await startRun(sql, collector);
  try {
    const result = await fn();
    await run.finish((result ?? undefined) as RunTotals | undefined);
    return result;
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

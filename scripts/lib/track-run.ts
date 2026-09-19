/**
 * Records what a collector did, so that silence becomes visible.
 *
 * The nightly job went 73 days without running and nothing noticed, because
 * the only signal was a workflow's exit code — and a workflow that never
 * starts never fails. Every collector now opens a row when it begins and
 * closes it when it ends, which turns "no news" into a measurable age.
 */

import type { SqlFn } from "../scrapers/utils/db";
import { collectorSpec, shortfallFor, type CollectorKey } from "../../lib/collectors";

export interface RunTotals {
  /** What the source offered this run. */
  seen?: number;
  /** What we managed to keep. A large gap between the two is the interesting
      case: a run that sees 263 start lists and stores 30 exits zero. */
  written?: number;
  metadata?: Record<string, unknown>;
  /**
   * Le collecteur s'est retiré volontairement, et dit pourquoi.
   *
   * Rendu par `main()` plutôt que levé : un retrait n'est pas une erreur, et
   * la ligne doit porter la raison pour que la page d'état dise « désactivé :
   * la porte premium est fermée » au lieu d'un rouge que personne ne peut
   * réparer.
   */
  skipped?: string;
}

export interface RunHandle {
  finish(totals?: RunTotals): Promise<void>;
  fail(error: unknown, totals?: RunTotals): Promise<void>;
  /**
   * Le collecteur a choisi de ne rien faire, et dit pourquoi.
   *
   * « Bosses Strava » est resté rouge cinq jours et le contrôle de nuit
   * s'apprêtait à le signaler : il ne tombait pas, il sortait volontairement
   * parce que la porte premium était fermée dans l'environnement du job — et
   * il sortait avant d'ouvrir sa ligne. Un silence délibéré ne se distinguait
   * pas d'une panne.
   */
  skip(reason: string): Promise<void>;
}

export async function startRun(
  sql: SqlFn,
  collector: CollectorKey
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
    status: "success" | "partial" | "failed" | "aborted" | "skipped",
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

  /* A job that overruns its timeout is killed with SIGTERM, and a row that
     was never closed reads "running" forever — twenty-six of them did, one a
     night, while the watchdog saw a collector that was always busy and never
     late. Closing the row on the way out turns the kill into a fact. */
  const onSignal = (signal: NodeJS.Signals) => {
    close("aborted", undefined, `tué par ${signal}`).finally(() =>
      process.exit(143)
    );
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  const forget = () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
  };

  return {
    async finish(totals) {
      forget();
      /* Voir beaucoup et ne garder presque rien mérite d'être dit — mais
         seulement là où c'est anormal. Une fiche d'organisateur qu'on ouvre
         pour voir si elle a du neuf n'en a pas neuf fois sur dix : marquer
         « partiel » chaque nuit pour ça, c'est apprendre à ignorer le mot.
         La nature du collecteur, déclarée une fois, tranche. */
      const kind = collectorSpec(collector)?.kind ?? "harvest";
      const last = { seen: totals?.seen ?? 0, written: totals?.written ?? 0 };
      const shortfall = shortfallFor(kind, last, { seen: 0, written: 0 });
      await close(shortfall ? "partial" : "success", totals, null);
    },
    async skip(reason) {
      forget();
      await close("skipped", undefined, reason.slice(0, 2000));
    },
    async fail(error, totals) {
      forget();
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      await close("failed", totals, message.slice(0, 2000));
    },
  };
}

/** Wraps a collector so it always reports, whichever way it ends. */
export async function trackRun<T extends RunTotals | void>(
  sql: SqlFn,
  collector: CollectorKey,
  fn: () => Promise<T>
): Promise<T> {
  const run = await startRun(sql, collector);
  try {
    const result = await fn();
    const totals = (result ?? undefined) as RunTotals | undefined;
    if (totals?.skipped) await run.skip(totals.skipped);
    else await run.finish(totals);
    return result;
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

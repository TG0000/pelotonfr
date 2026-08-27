"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Inbox, X } from "lucide-react";
import {
  MISS_REASONS,
  type QueuedMiss,
} from "@/lib/db/queries/startlist-queue";
import { attachStartlist, setAsideStartlist } from "@/app/(main)/etat/actions";
import { displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";

/**
 * The unplaced start lists, one row per proposition.
 *
 * Read-only for a visitor — knowing that sixty lists are waiting is part of
 * knowing how complete the calendar is. Only the operator sees the two buttons,
 * and only their session can act on them.
 */
export function StartlistQueue({
  misses,
  summary,
  canArbitrate,
}: {
  misses: QueuedMiss[];
  summary: { open: number; arbitrable: number; resolved: number };
  canArbitrate: boolean;
}) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (summary.open === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface-1 px-4 py-6 text-sm text-muted-foreground">
        Aucune liste en attente. Toutes les listes publiées ont trouvé leur
        course.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        <span className="font-mono tabular-nums text-foreground">
          {summary.open}
        </span>{" "}
        liste{summary.open > 1 ? "s" : ""} publiée
        {summary.open > 1 ? "s" : ""} sans course, dont{" "}
        <span className="font-mono tabular-nums text-foreground">
          {summary.arbitrable}
        </span>{" "}
        avec une course candidate ce jour-là.
        {summary.resolved > 0 && (
          <>
            {" "}
            <span className="font-mono tabular-nums">{summary.resolved}</span>{" "}
            déjà tranchée{summary.resolved > 1 ? "s" : ""}.
          </>
        )}
      </p>

      <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
        {misses.map((m) => {
          const verdict = done[m.id];
          return (
            <div key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {m.raceDate
                    ? new Date(`${m.raceDate}T12:00:00`).toLocaleDateString(
                        "fr-FR",
                        { day: "2-digit", month: "short", year: "2-digit" }
                      )
                    : "date inconnue"}
                </span>
                <span className="text-sm font-medium">
                  {m.commune ?? "commune inconnue"}
                </span>
                <a
                  href={m.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  la liste publiée
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                {MISS_REASONS[m.reason] ?? m.reason}
              </div>

              {m.bestRaceId && m.bestRaceName && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Candidate :</span>
                  <Link
                    href={`/course/${m.bestRaceId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {displayRaceName(m.bestRaceName)}
                  </Link>
                  {m.bestRaceCity && m.bestRaceCity !== "Lieu à préciser" && (
                    <span className="text-muted-foreground">
                      à {m.bestRaceCity}
                    </span>
                  )}
                  {m.bestScore != null && (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {Math.round(m.bestScore * 100)} %
                    </span>
                  )}
                </div>
              )}

              {verdict ? (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-fsgt">
                  <CheckCircle2 className="size-3.5" />
                  {verdict}
                </div>
              ) : (
                canArbitrate && (
                  <div className="mt-2 flex gap-2">
                    {m.bestRaceId && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await attachStartlist(m.id, m.bestRaceId!);
                            setDone((d) => ({ ...d, [m.id]: r.message }));
                          })
                        }
                        className={cn(
                          "rounded-lg border border-border px-2 py-1 text-xs font-medium transition-colors",
                          "hover:bg-surface-2 disabled:opacity-50"
                        )}
                      >
                        C&apos;est cette course
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await setAsideStartlist(m.id);
                          setDone((d) => ({ ...d, [m.id]: r.message }));
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                    >
                      <X className="size-3" />
                      Écarter
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {!canArbitrate && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Inbox className="mt-0.5 size-3.5 shrink-0" />
          Chaque liste tranchée l&apos;est une fois pour toutes : la collecte
          suivante lit l&apos;arbitrage avant son propre rapprochement.
        </p>
      )}
    </div>
  );
}

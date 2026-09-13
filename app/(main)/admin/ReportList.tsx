"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, EyeOff } from "lucide-react";
import { treatReport } from "./actions";
import { REPORT_KINDS, type OpenReport } from "@/lib/db/queries/reports";
import { displayRaceName } from "@/lib/race-name";

const LABEL = new Map<string, string>(REPORT_KINDS.map((k) => [k.value, k.label]));

/** Les signalements ouverts, du plus récent au plus ancien, chacun avec ses deux gestes. */
export function ReportList({ reports }: { reports: OpenReport[] }) {
  const [pending, start] = useTransition();
  if (reports.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Rien à traiter. Les lecteurs n&apos;ont rien signalé.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{LABEL.get(r.kind) ?? r.kind}</div>
            {r.raceName && (
              <Link href={`/course/${r.raceId}`} className="text-sm text-primary hover:underline">
                {displayRaceName(r.raceName)}
                {r.raceDate && <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">{r.raceDate}</span>}
              </Link>
            )}
            {r.message && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.message}</p>}
            <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleString("fr-FR")}
              {r.contact && <> · <a href={`mailto:${r.contact}`} className="underline">{r.contact}</a></>}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => treatReport(r.id, "traite"))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
              title="Corrigé"
            >
              <Check className="size-3.5" /> Traité
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => treatReport(r.id, "ignore"))}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
              title="Sans suite"
            >
              <EyeOff className="size-3.5" /> Écarter
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

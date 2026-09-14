import Link from "next/link";
import { Route } from "lucide-react";
import type { TraceCheck } from "@/lib/db/queries/traces";
import { displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  faux: "mauvaise boucle",
  confirme: "confirmé",
  echauffement: "échauffement remplacé",
  audit: "retiré à l'audit",
  douteux: "à vérifier",
};

/**
 * Les circuits vérifiés après coup.
 *
 * Chaque fois qu'une sortie de coureur arrive sur une course dont on avait
 * déduit le circuit, on mesure le recouvrement avant de remplacer. Une ligne
 * « mauvaise boucle » dit que la détection s'était trompée, et de combien.
 */
export function TraceChecks({ checks, counts }: { checks: TraceCheck[]; counts: { faux: number; confirme: number; echauffement: number; audit: number; douteux: number } }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Route className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">Circuits vérifiés</h2>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {counts.confirme} confirmés · {counts.faux} faux · {counts.douteux} à vérifier · {counts.echauffement} échauffements · {counts.audit} retirés
        </span>
      </div>
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune vérification encore : elle se fait quand une sortie de coureur arrive sur une course dont le circuit avait été déduit.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.id} className="rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("rounded-full border px-1.5 text-[0.65rem] font-semibold uppercase tracking-wide", c.verdict === "faux" ? "border-destructive/40 text-destructive" : c.verdict === "confirme" ? "border-fsgt/40 text-fsgt" : "border-border text-muted-foreground")}>
                  {LABEL[c.verdict] ?? c.verdict}
                </span>
                {c.raceId ? (
                  <Link href={`/course/${c.raceId}`} className="font-medium hover:underline">{displayRaceName(c.raceName ?? "")}</Link>
                ) : (
                  <span className="font-medium">{c.raceName}</span>
                )}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.raceDate?.slice(0, 10)}</span>
                {c.overlap != null && <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(c.overlap * 100)} %</span>}
              </div>
              {c.reason && <div className="text-xs text-muted-foreground">{c.reason}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

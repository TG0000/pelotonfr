import { ShieldCheck } from "lucide-react";
import type { DataIssue } from "@/lib/db/queries/data-issues";
import { cn } from "@/lib/utils";

/**
 * Le garde-fou des données, tel qu'il a tourné la dernière nuit.
 *
 * Une ligne par contrôle : trouvé, corrigé d'office, et ce qui reste à
 * regarder. Ce qui est à zéro est dit à zéro — c'est ce qui rassure.
 */
export function DataIssues({ issues }: { issues: DataIssue[] }) {
  const open = issues.reduce((s, i) => s + Math.max(0, i.found - i.fixed), 0);
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">Garde-fou des données</h2>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {open === 0 ? "rien à regarder" : `${open} à regarder`}{issues[0] ? ` · ${issues[0].runAt.slice(0, 16).replace("T", " ")}` : ""}
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pas encore passé : il tourne chaque nuit après les collecteurs.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {issues.map((i) => {
            const rest = Math.max(0, i.found - i.fixed);
            return (
              <li key={i.check} className="flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2">
                <span className={cn("size-2 shrink-0 rounded-full", rest === 0 ? "bg-fsgt" : rest < 20 ? "bg-accent" : "bg-destructive")} aria-hidden />
                <span className="font-medium">{i.check}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{i.found} trouvé{i.found > 1 ? "s" : ""}{i.fixed > 0 ? ` · ${i.fixed} corrigé${i.fixed > 1 ? "s" : ""}` : ""}</span>
                {i.note && <span className="text-xs text-muted-foreground">{i.note}</span>}
                {rest > 0 && i.sample.length > 0 && (
                  <span className="basis-full truncate pl-4 text-xs text-muted-foreground">
                    {i.sample.slice(0, 3).map((s) => String(s.name ?? s.race ?? s.nom ?? s.collector ?? "")).filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

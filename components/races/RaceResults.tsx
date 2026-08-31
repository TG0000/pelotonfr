import { Trophy } from "lucide-react";
import Link from "next/link";
import { getRaceResults } from "@/lib/db/queries/race-detail";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * Qui a gagné.
 *
 * Après la course, c'est la seule question. La page en montrait la météo, les
 * engagés attendus et le peloton du secteur — jamais le classement, alors que
 * quatre cent mille lignes dormaient en base.
 *
 * Le podium en grand, le reste en liste : un classement se lit par le haut, et
 * les places d'après servent à s'y chercher soi-même.
 */
export async function RaceResults({ raceId }: { raceId: string }) {
  const results = await getRaceResults(raceId);
  if (results.length === 0) return null;

  const podium = results.slice(0, 3);
  const rest = results.slice(3);

  return (
    <div>
      <SectionHeading icon={Trophy}>
        Classement
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          {results.length} classé{results.length > 1 ? "s" : ""}
        </span>
      </SectionHeading>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {podium.map((r, i) => (
          <div
            key={`${r.lastName}-${r.rank}`}
            className={cn(
              "rounded-xl border p-3",
              i === 0
                ? "border-accent/50 bg-accent/5"
                : "border-border bg-surface-1"
            )}
          >
            <div className="mb-1 font-mono text-xs tabular-nums text-muted-foreground">
              {r.rank}
              <sup>{r.rank === 1 ? "er" : "e"}</sup>
            </div>
            <Name row={r} className="font-medium" />
            {r.club && (
              <div className="mt-0.5 text-xs text-muted-foreground">{r.club}</div>
            )}
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <div className="scroll-x max-h-96 overflow-y-auto rounded-xl border border-border bg-surface-1">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {rest.map((r) => (
                <tr key={`${r.lastName}-${r.rank}`}>
                  <td className="w-12 px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {r.rank ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <Name row={r} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {r.club}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Un coureur qu'on connaît est un lien vers sa saison ; les autres, du texte. */
function Name({
  row,
  className,
}: {
  row: Awaited<ReturnType<typeof getRaceResults>>[number];
  className?: string;
}) {
  const label = `${row.lastName}${row.firstName ? ` ${row.firstName}` : ""}`;
  if (!row.uciId) return <span className={className}>{label}</span>;
  return (
    <Link
      href={`/coureur/${row.uciId}`}
      className={cn("underline-offset-2 hover:underline", className)}
    >
      {label}
    </Link>
  );
}

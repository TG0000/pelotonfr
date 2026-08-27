import Link from "next/link";
import { Users } from "lucide-react";
import { getStartList } from "@/lib/db/queries/race-detail";
import { EmptyState } from "@/components/common/States";
import { cn } from "@/lib/utils";

/**
 * Who is actually coming.
 *
 * The list on its own is a column of names. What makes it a briefing is the
 * record beside each one: a national ranking, a win count, how much racing
 * they have done. That is the difference between knowing eighty riders entered
 * and knowing which three decide the race.
 */
export async function StartList({ raceId }: { raceId: string }) {
  let list: Awaited<ReturnType<typeof getStartList>> = null;
  try {
    list = await getStartList(raceId);
  } catch {
    return null;
  }

  if (!list) {
    return (
      <section>
        <SectionHeading icon={Users}>Engagés</SectionHeading>
        <EmptyState
          compact
          title="Liste des engagés pas encore publiée"
          action="Elle paraît en général deux à trois jours avant la course."
        />
      </section>
    );
  }

  // The ones worth watching: ranked nationally, or with wins behind them.
  const watch = list.entrants
    .filter((e) => e.rank !== null || e.wins > 0)
    .slice(0, 8);

  return (
    <section>
      <SectionHeading icon={Users}>
        Engagés
        <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted-foreground">
          {list.total}
        </span>
      </SectionHeading>

      {watch.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-surface-1 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            À surveiller
          </h3>
          <div className="divide-y divide-border/60">
            {watch.map((e, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <RiderName entrant={e} className="min-w-0 flex-1" />
                <div className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  {e.rank !== null && (
                    <span className="text-accent" title="Classement national">
                      #{e.rank}
                    </span>
                  )}
                  {e.wins > 0 && (
                    <span className="text-muted-foreground" title="Victoires">
                      {e.wins}&nbsp;V
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="group rounded-xl border border-border bg-surface-1">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium hover:bg-surface-2">
          Voir les {list.total} engagés
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {list.identified} reconnus au fichier
          </span>
        </summary>
        <div className="max-h-96 overflow-y-auto border-t border-border">
          <div className="divide-y divide-border/60">
            {list.entrants.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                {e.bib && (
                  <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {e.bib}
                  </span>
                )}
                <RiderName entrant={e} className="min-w-0 flex-1" />
                {e.rank !== null && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    #{e.rank}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </details>

      {list.sourceUrl && (
        <p className="mt-2 text-xs text-muted-foreground">
          Source :{" "}
          <a
            href={list.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Vélopresse Collection
          </a>
        </p>
      )}
    </section>
  );
}

function RiderName({
  entrant,
  className,
}: {
  entrant: { lastName: string; firstName: string | null; club: string | null; uciId: string | null };
  className?: string;
}) {
  const name = `${entrant.firstName ?? ""} ${entrant.lastName}`.trim();
  return (
    <span className={cn("truncate", className)}>
      {entrant.uciId ? (
        <Link
          href={`/coureur/${entrant.uciId}`}
          className="font-medium hover:text-primary"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      {entrant.club && (
        <span className="ml-2 text-xs text-muted-foreground">{entrant.club}</span>
      )}
    </span>
  );
}

export function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-semibold">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </h2>
  );
}

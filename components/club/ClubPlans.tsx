import Link from "next/link";
import { CalendarCheck, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { ClubPlan } from "@/lib/db/queries/club";
import { displayRaceName } from "@/lib/race-name";
import { FederationMark } from "@/components/races/RacePrimitives";
import { GroupPicker } from "./GroupPicker";
import { cn } from "@/lib/utils";

/**
 * Où vont les coéquipiers.
 *
 * Le mardi soir, la question du club : « qui va où ce week-end ? ». Chaque
 * course qu'un membre a mise à son calendrier, avec qui y va et qui y pense,
 * et les courses de ma catégorie d'abord — c'est là qu'on peut partir
 * ensemble et rouler ensemble.
 */
export function ClubPlans({
  plans,
  viewerGroups,
  onlyMine,
}: {
  plans: ClubPlan[];
  viewerGroups: string[];
  onlyMine: boolean;
}) {
  const hasGroups = viewerGroups.length > 0;
  const shown = onlyMine && hasGroups ? plans.filter((p) => p.fitsMe) : plans;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarCheck className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">Où vont les coéquipiers</h2>
        <span className="text-sm text-muted-foreground">
          {plans.length} course{plans.length > 1 ? "s" : ""} au calendrier du club
        </span>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <Link
            href="/club"
            className={cn("rounded-full border px-2.5 py-1", !onlyMine ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-2")}
          >
            Tout le club
          </Link>
          {hasGroups ? (
            <Link
              href="/club?cat=moi"
              className={cn("rounded-full border px-2.5 py-1", onlyMine ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-2")}
            >
              Mes groupes
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-3">
        <GroupPicker chosen={viewerGroups} />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {onlyMine
            ? "Aucun coéquipier sur une course de vos groupes, pour l'instant."
            : "Personne n'a encore mis de course à son calendrier. Programmez-en une : elle apparaîtra ici pour les autres."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-surface-1">
          {shown.map((p) => (
            <li key={p.raceId} className="flex items-start gap-3 px-4 py-3">
              <div className="w-12 shrink-0 text-center">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {format(new Date(`${p.raceDate}T12:00:00Z`), "EEE", { locale: fr })}
                </div>
                <div className="font-mono text-lg font-bold leading-none tabular-nums">
                  {format(new Date(`${p.raceDate}T12:00:00Z`), "d", { locale: fr })}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {format(new Date(`${p.raceDate}T12:00:00Z`), "MMM", { locale: fr })}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/course/${p.raceId}`} className="block truncate text-sm font-medium hover:text-primary">
                  {displayRaceName(p.raceName)}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <FederationMark slug={p.federationSlug} />
                  {p.city && <span>{p.city}{p.departmentCode ? ` (${p.departmentCode})` : ""}</span>}
                  {hasGroups && p.fitsMe && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">avec moi</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  {p.going.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3 text-accent" />
                      <span className="font-medium">{p.going.join(", ")}</span>
                      <span className="text-muted-foreground">{p.going.length > 1 ? "y vont" : "y va"}</span>
                    </span>
                  )}
                  {p.considering.length > 0 && (
                    <span className="text-muted-foreground">
                      {p.considering.join(", ")} {p.considering.length > 1 ? "y pensent" : "y pense"}
                    </span>
                  )}
                  {p.mine && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                      {p.mine === "programmee" ? "vous y allez" : "vous y pensez"}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

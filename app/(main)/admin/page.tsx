import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, Flag, Radio, Users } from "lucide-react";
import { isOperator } from "@/lib/admin";
import { getCollectorHealth } from "@/lib/db/queries/collectors";
import { getLiveViewers, getOpenReports, getSiteKpis, type SiteKpis } from "@/lib/db/queries/reports";
import { describeAge } from "@/lib/collectors";
import { ReportList } from "./ReportList";
import { LiveMap } from "@/components/ops/LiveMap";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Le tableau de bord de l'opérateur.
 *
 * Ce qui va bien, en chiffres ; ce qui se passe, en direct ; ce qu'il reste
 * à faire, en liste. Invisible pour tout autre lecteur : la page n'existe pas.
 */

function Kpi({ label, value, of, hint, tone }: { label: string; value: number; of?: number; hint?: string; tone?: "good" | "warn" }) {
  const pct = of && of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("font-mono text-2xl font-bold tabular-nums", tone === "warn" && "text-ufolep", tone === "good" && "text-accent")}>
          {value.toLocaleString("fr-FR")}
        </span>
        {pct !== null && <span className="font-mono text-sm tabular-nums text-muted-foreground">{pct} %</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function coverage(k: SiteKpis) {
  return [
    { label: "Courses à venir", value: k.upcoming, hint: "non annulées" },
    { label: "Avec un circuit", value: k.withTrace, of: k.upcoming, hint: "tracé connu", tone: "good" as const },
    { label: "Avec des engagés", value: k.withEntrants, of: k.upcoming, hint: "liste publiée et rattachée" },
    { label: "Fiche organisateur lue", value: k.withBriefing, of: k.upcoming },
    { label: "Affiche exploitée", value: k.withPoster, of: k.upcoming, hint: "horaire ou circuit lu" },
    { label: "Courses par étapes détaillées", value: k.withStages },
    { label: "Sans lieu", value: k.withoutPlace, of: k.upcoming, hint: "à placer", tone: "warn" as const },
    { label: "Engagés lus (30 j)", value: k.entrants30d },
    { label: "Résultats de la semaine", value: k.resultsLast7d },
  ];
}

export default async function AdminPage() {
  if (!(await isOperator())) notFound();

  const [kpis, live, reports, health] = await Promise.all([
    getSiteKpis(),
    getLiveViewers(30),
    getOpenReports(),
    getCollectorHealth().catch(() => []),
  ]);
  const broken = health.filter((h) => h.verdict === "overdue" || h.verdict === "never" || h.verdict === "late");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <h1 className="text-3xl font-bold">Tableau de bord</h1>
          </div>
          <p className="text-sm text-muted-foreground">Ce qui va bien, ce qui se passe, ce qu&apos;il reste à faire.</p>
        </div>
        <Link href="/etat" className="text-sm text-primary hover:underline">État des collecteurs →</Link>
      </header>

      {/* En direct */}
      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-4 md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="size-4 text-accent" />
            <h2 className="font-semibold">En ce moment</h2>
            <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
              {live.total} vue{live.total > 1 ? "s" : ""} · 30 min
            </span>
          </div>
          <div className="mb-3">
            <LiveMap cities={live.cities} />
          </div>
          {live.cities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Personne depuis une demi-heure.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {live.cities.map((c) => (
                <li key={`${c.city}-${c.region}`} className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-surface-2">
                  <span className="truncate">
                    {c.city}
                    {c.region && <span className="ml-1 text-xs text-muted-foreground">{c.region}</span>}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {c.views} · {describeAge(c.ageHours)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-2 text-sm font-semibold">Pages lues</h2>
          <ul className="flex flex-col gap-1">
            {live.paths.map((p) => (
              <li key={p.path} className="flex items-center justify-between text-sm">
                <span className="truncate font-mono text-xs">{p.path}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{p.views}</span>
              </li>
            ))}
            {live.paths.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div><span className="font-mono text-base font-bold tabular-nums text-foreground">{kpis.views24h}</span><br />vues 24 h</div>
            <div><span className="font-mono text-base font-bold tabular-nums text-foreground">{kpis.views7d}</span><br />vues 7 j</div>
            <div><span className="font-mono text-base font-bold tabular-nums text-foreground">{kpis.users}</span><br />comptes</div>
            <div><span className="font-mono text-base font-bold tabular-nums text-foreground">{kpis.favourites}</span><br />courses planifiées</div>
          </div>
        </div>
      </section>

      {/* Couverture */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users className="size-4 text-muted-foreground" />Ce que le site sait</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {coverage(kpis).map((k) => <Kpi key={k.label} {...k} />)}
        </div>
      </section>

      {/* À traiter */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Flag className="size-4 text-ufolep" />
            <h2 className="font-semibold">À traiter</h2>
            <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
              {kpis.reportsOpen} ouvert{kpis.reportsOpen > 1 ? "s" : ""} · {kpis.reportsCircuit} circuit{kpis.reportsCircuit > 1 ? "s" : ""} signalé{kpis.reportsCircuit > 1 ? "s" : ""}
            </span>
          </div>
          <ReportList reports={reports} />
        </div>

        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className={cn("size-4", broken.length ? "text-destructive" : "text-muted-foreground")} />
            <h2 className="font-semibold">Alertes</h2>
          </div>
          {broken.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tous les collecteurs sont à l&apos;heure.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {broken.map((h) => (
                <li key={h.key} className="text-sm">
                  <span className="font-medium">{h.label}</span>
                  <span className="ml-1 text-muted-foreground">
                    — {h.verdict === "never" ? "jamais passé" : `dernier passage ${describeAge(h.ageHours)}`}
                  </span>
                  {h.lastError && <div className="mt-0.5 truncate font-mono text-[11px] text-destructive">{h.lastError}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

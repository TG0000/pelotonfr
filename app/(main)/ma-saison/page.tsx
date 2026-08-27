import type { Metadata } from "next";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { CalendarCheck, Flag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getMySeason, type MySeason } from "@/lib/db/queries/my-season";
import { RiderClaim } from "@/components/me/RiderClaim";
import { EmptyState } from "@/components/common/States";
import {
  CategorySummary, DateBlock, FederationMark, PlaceLabel,
} from "@/components/races/RacePrimitives";
import { SectionHeading } from "@/components/races/StartList";
import { displayRaceName } from "@/lib/race-name";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ma saison",
  description:
    "Vos courses à venir, vos résultats et votre progression au classement.",
};

export const dynamic = "force-dynamic";

/**
 * A placing means nothing without the field it was taken from: eighth of
 * twelve and eighth of a hundred and forty are different afternoons.
 */
function placing(rank: number | null, field: number): string {
  if (rank === null) return "—";
  return field > 0 ? `${rank}ᵉ / ${field}` : `${rank}ᵉ`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function MaSaisonPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-3xl font-bold">Ma saison</h1>
        <p className="mb-6 text-muted-foreground">
          Vos courses à venir, vos résultats et votre progression au classement,
          au même endroit.
        </p>
        <div className="rounded-xl border border-border bg-surface-1 py-12 text-center">
          <p className="mb-1 font-medium">Connectez-vous pour construire votre saison</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Le calendrier reste consultable sans compte.
          </p>
          <SignInButton mode="modal">
            <Button>Se connecter</Button>
          </SignInButton>
        </div>
      </div>
    );
  }

  const today = todayISO();
  const season = Number(today.slice(0, 4));

  let data: MySeason | null = null;
  try {
    const user = await currentUser();
    const id = await resolveUser(
      userId,
      user?.primaryEmailAddress?.emailAddress ?? null
    );
    data = await getMySeason(id, season);
  } catch {
    // DB not configured
  }

  const rider = data?.rider ?? null;
  const results = data?.results ?? [];
  const targets = data?.targets ?? [];

  const wins = results.filter((r) => r.rank === 1).length;
  const podiums = results.filter((r) => r.rank !== null && r.rank <= 3).length;
  const topTen = results.filter((r) => r.rank !== null && r.rank <= 10).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Ma saison</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rider
            ? `${rider.name}${rider.club ? ` · ${rider.club}` : ""} — saison ${season}`
            : "Vos courses, vos résultats et votre progression."}
        </p>
      </header>

      <div className="mb-8">
        <RiderClaim current={rider} />
      </div>

      {rider && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Courses"
              value={String(results.length)}
              hint={`saison ${season}`}
            />
            <Stat label="Victoires" value={String(wins)} />
            <Stat label="Podiums" value={String(podiums)} hint={`${topTen} top 10`} />
            <Stat
              label="Classement"
              value={data?.ranking.rank ? `#${data.ranking.rank}` : "—"}
              hint={
                data?.best.rank
                  ? `meilleur #${data.best.rank}${data.best.season ? ` en ${data.best.season}` : ""}`
                  : "national"
              }
            />
          </div>

          <section className="mb-8">
            <SectionHeading icon={CalendarCheck}>
              Mes prochaines courses
              {targets.length > 0 && (
                <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  {targets.length}
                </span>
              )}
            </SectionHeading>

            {targets.length === 0 ? (
              <EmptyState
                compact
                title="Aucune course visée"
                action="Ajoutez une course en favori depuis le calendrier pour la retrouver ici."
              >
                <Link
                  href="/calendrier"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Ouvrir le calendrier
                </Link>
              </EmptyState>
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface-1">
                {targets.map((t) => (
                  <Link
                    key={t.raceId}
                    href={`/course/${t.raceId}`}
                    className="group flex items-center gap-4 px-3 py-3"
                  >
                    <DateBlock date={t.date} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium group-hover:text-primary">
                        {displayRaceName(t.raceName)}
                      </div>
                      <PlaceLabel
                        race={{
                          city: t.city,
                          departmentCode: t.departmentCode,
                          departmentName: null,
                        }}
                        className="block text-sm text-muted-foreground"
                      />
                      <div className="mt-0.5 flex items-center gap-2">
                        <FederationMark slug={t.federationSlug} withLabel />
                        <CategorySummary categories={t.categories} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {t.distanceKm != null && (
                        <span className="font-mono text-xs tabular-nums text-primary">
                          {Math.round(t.distanceKm)} km
                        </span>
                      )}
                      {t.hasStartList && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                          engagés publiés
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeading icon={Flag}>
              Mes résultats {season}
              {results.length > 0 && (
                <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  {results.length}
                </span>
              )}
            </SectionHeading>

            {results.length === 0 ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title={`Aucun résultat enregistré en ${season}`}
                action="Les classements sont repris des publications fédérales, en général quelques jours après la course."
              />
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-surface-1">
                {results.map((r) => (
                  <Link
                    key={`${r.raceId}-${r.date}`}
                    href={`/course/${r.raceId}`}
                    className="group flex items-center gap-3 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "w-16 shrink-0 text-center font-mono text-sm tabular-nums",
                        r.rank === 1 && "font-bold text-accent",
                        r.rank !== null && r.rank > 1 && r.rank <= 3 && "font-semibold text-accent/80",
                        (r.rank === null || r.rank > 3) && "text-muted-foreground"
                      )}
                    >
                      {placing(r.rank, r.fieldSize)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:text-primary">
                        {displayRaceName(r.raceName)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.date} · {r.city}
                        {r.departmentCode && ` (${r.departmentCode})`}
                      </div>
                    </div>
                    {r.points != null && r.points > 0 && (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {r.points} pts
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

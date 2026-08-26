import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Trophy, Medal, Flag, TrendingUp, Users } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { Separator } from "@/components/ui/separator";
import { getRiderProfile } from "@/lib/db/queries/rider-profile";
import { getRiderResults } from "@/lib/db/queries/riders";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PageProps {
  params: Promise<{ uciId: string }>;
}

function fullName(last: string, first: string | null): string {
  return [last, first].filter(Boolean).join(" ");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { uciId } = await params;
  try {
    const profile = await getRiderProfile(uciId);
    if (!profile) return { title: "Coureur introuvable" };
    const name = fullName(profile.identity.lastName, profile.identity.firstName);
    return {
      title: `${name} — palmarès et classement`,
      description: `Palmarès, classement national et résultats de ${name}${
        profile.identity.clubName ? ` (${profile.identity.clubName})` : ""
      }.`,
    };
  } catch {
    return { title: "Coureur" };
  }
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Trophy;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export default async function RiderPage({ params }: PageProps) {
  const { uciId } = await params;

  let profile;
  try {
    profile = await getRiderProfile(uciId);
  } catch {
    // DB not configured
  }
  if (!profile) notFound();

  const { identity, seasons } = profile;
  const name = fullName(identity.lastName, identity.firstName);
  const results = await getRiderResults(identity.id, 20).catch(() => []);

  // A rider whose best season is well ahead of the current one is on the way
  // back rather than simply modest — worth stating plainly.
  const returning =
    identity.bestPoints != null &&
    identity.bestSeason != null &&
    identity.bestSeason !== identity.currentSeason &&
    (identity.currentPoints ?? 0) < identity.bestPoints * 0.5;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 w-full">
      <Link
        href="/calendrier?vue=liste"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 gap-1.5 mb-6")}
      >
        <ArrowLeft className="size-4" />
        Retour
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">{name}</h1>
        <div className="flex items-center gap-2 flex-wrap mt-1.5 text-sm text-muted-foreground">
          {identity.category && (
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium text-xs">
              {identity.category}
            </span>
          )}
          {identity.clubName && <span>{identity.clubName}</span>}
          <span className="text-xs">UCI {identity.uciId}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border bg-card mb-6">
        <Stat
          icon={TrendingUp}
          label="Points"
          value={
            identity.currentPoints != null
              ? Math.round(identity.currentPoints).toLocaleString("fr-FR")
              : "—"
          }
        />
        <Stat
          icon={Users}
          label="Rang national"
          value={identity.currentRank ? `${identity.currentRank}ᵉ` : "—"}
        />
        <Stat icon={Trophy} label="Victoires" value={identity.winCount} />
        <Stat icon={Medal} label="Podiums" value={identity.podiumCount} />
      </div>

      {returning && (
        <p className="text-sm mb-6 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400">
          Meilleure saison en {identity.bestSeason} avec{" "}
          {Math.round(identity.bestPoints!).toLocaleString("fr-FR")} points — nettement
          au-dessus de son niveau actuel.
        </p>
      )}

      {seasons.length > 0 && (
        <section className="mb-8">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Flag className="size-4 text-primary" />
            Saison par saison
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Saison</th>
                  <th className="text-left font-medium px-3 py-2">Catégorie</th>
                  <th className="text-right font-medium px-3 py-2">Points</th>
                  <th className="text-right font-medium px-3 py-2">Rang</th>
                  <th className="text-right font-medium px-3 py-2">Courses</th>
                  <th className="text-right font-medium px-3 py-2">V</th>
                  <th className="text-right font-medium px-3 py-2">P</th>
                  <th className="text-right font-medium px-3 py-2">Top 10</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.season} className="border-t">
                    <td className="px-3 py-2 font-medium tabular-nums">{s.season}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.points != null ? Math.round(s.points).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.rank ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.races}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{s.wins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.podiums}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.topTen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Derniers résultats</h2>
          <div className="flex flex-col gap-1.5">
            {results.map((r) => (
              <Link
                key={`${r.raceId}-${r.raceDate}`}
                href={`/course/${r.raceId}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:border-primary/40 transition-colors"
              >
                <span
                  className={cn(
                    "shrink-0 w-9 text-center text-sm font-bold tabular-nums",
                    r.rank === 1 && "text-amber-500",
                    r.rank != null && r.rank > 1 && r.rank <= 3 && "text-muted-foreground"
                  )}
                >
                  {r.rank ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.raceName}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(r.raceDate + "T12:00:00Z"), "d MMM yyyy", { locale: fr })}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.fieldSize ? ` · ${r.fieldSize} classés` : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Separator className="my-8" />
      <p className="text-xs text-muted-foreground">
        Données issues des classements et résultats publics de la FFC.
      </p>
    </div>
  );
}

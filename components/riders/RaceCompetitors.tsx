import Link from "next/link";
import { Users, TrendingUp, RotateCcw, Trophy, Info } from "lucide-react";
import { getRaceCompetitors } from "@/lib/db/queries/rider-profile";
import type { RaceCompetitor } from "@/lib/db/queries/rider-profile";

/**
 * Riders a competitor will be up against.
 *
 * Shows the published start list where the regional press has one, and falls
 * back to whoever rode past editions otherwise. The distinction is stated in the
 * header rather than hidden: a prediction and a confirmed entry list deserve
 * different trust, and pretending otherwise would be the wrong kind of polish.
 */

const KIND_LABEL: Record<string, { text: string; className: string; icon: typeof TrendingUp }> = {
  in_form: {
    text: "En forme",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    icon: TrendingUp,
  },
  returning: {
    text: "De retour",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    icon: RotateCcw,
  },
  specialist: {
    text: "Spécialiste",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    icon: Trophy,
  },
  regular: { text: "", className: "", icon: Users },
};

function formatPoints(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString("fr-FR");
}

function CompetitorRow({ competitor }: { competitor: RaceCompetitor }) {
  const kind = KIND_LABEL[competitor.kind] ?? KIND_LABEL.regular;
  const Icon = kind.icon;
  const name = [competitor.lastName, competitor.firstName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:border-primary/40 transition-colors">
      {competitor.bib && (
        <span className="shrink-0 w-8 h-8 rounded-md bg-muted grid place-items-center text-xs font-bold tabular-nums">
          {competitor.bib}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {competitor.uciId ? (
            <Link
              href={`/coureur/${competitor.uciId}`}
              className="font-medium text-sm hover:text-primary transition-colors truncate"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium text-sm truncate">{name}</span>
          )}

          {competitor.category && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {competitor.category}
            </span>
          )}

          {kind.text && (
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 shrink-0 ${kind.className}`}
            >
              <Icon className="size-3" />
              {kind.text}
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {competitor.clubName ?? "Sans club connu"}
        </div>
      </div>

      <div className="shrink-0 text-right text-xs tabular-nums">
        <div className="font-semibold">
          {formatPoints(competitor.currentPoints)}
          <span className="text-muted-foreground font-normal"> pts</span>
        </div>
        <div className="text-muted-foreground">
          {competitor.currentRank ? `${competitor.currentRank}ᵉ national` : "non classé"}
        </div>
      </div>

      {competitor.resultCount != null && (
        <div className="shrink-0 hidden sm:block text-right text-xs text-muted-foreground tabular-nums w-20">
          <div>
            <span className="font-medium text-foreground">{competitor.winCount ?? 0}</span> V ·{" "}
            <span className="font-medium text-foreground">{competitor.podiumCount ?? 0}</span> P
          </div>
          <div>{competitor.resultCount} courses</div>
        </div>
      )}
    </div>
  );
}

export async function RaceCompetitors({ raceId }: { raceId: string }) {
  let data: Awaited<ReturnType<typeof getRaceCompetitors>>;
  try {
    data = await getRaceCompetitors(raceId, 40);
  } catch {
    return null;
  }

  if (data.competitors.length === 0) return null;

  const confirmed = data.source === "startlist";
  const regional = data.source === "regional";
  const toWatch = data.competitors.filter(
    (c) => c.kind === "in_form" || c.kind === "returning"
  ).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Users className="size-4 text-primary" />
          {confirmed
            ? "Engagés"
            : regional
              ? "Le peloton du secteur"
              : "Concurrents probables"}
          <span className="text-sm font-normal text-muted-foreground">
            {data.competitors.length}
          </span>
        </h2>
        {toWatch > 0 && (
          <span className="text-xs text-muted-foreground">
            {toWatch} à surveiller
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        {confirmed
          ? "Liste des engagés publiée par la presse régionale, enrichie du classement national."
          : regional
            ? "Aucune édition précédente au fichier : voici les coureurs actifs sur ces catégories dans le département cette saison. Ils indiquent le niveau du peloton, pas une liste de partants."
            : "Estimé à partir des coureurs ayant disputé les éditions précédentes — la liste des engagés n’est pas encore publiée."}
      </p>

      <div className="flex flex-col gap-1.5">
        {data.competitors.map((competitor, index) => (
          <CompetitorRow
            key={`${competitor.riderId ?? competitor.lastName}-${index}`}
            competitor={competitor}
          />
        ))}
      </div>
    </section>
  );
}

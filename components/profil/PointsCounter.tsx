import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { assess, isLadderCategory, ladderLabel } from "@/lib/category-rules";
import type { RiderSeason } from "@/lib/db/queries/points";
import { displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";

/**
 * Le compteur de catégorie.
 *
 * Deux règles que le coureur confond : la montée en cours de saison (victoires
 * ou barème 6-4-3-2-1) et la classification de fin de saison au classement
 * national. Le compteur tient les deux, sur ses propres résultats, et dit
 * ce qui manque — ou, quand la saison n'a rien donné, prépare la lettre.
 */
export function PointsCounter({ season }: { season: RiderSeason | null }) {
  if (!season) {
    return (
      <section className="rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" /> Ma catégorie</h2>
        <p className="text-sm text-muted-foreground">
          Ton compte n&rsquo;est pas encore relié à un coureur du fichier des
          résultats. Retrouve-toi dans <Link href="/coureur" className="underline">les coureurs</Link> et
          dis « c&rsquo;est moi » : le compteur se remplira avec tes classements.
        </p>
      </section>
    );
  }
  if (!isLadderCategory(season.category)) {
    return (
      <section className="rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" /> Ma catégorie</h2>
        <p className="text-sm text-muted-foreground">
          Le compteur suit l&rsquo;échelle FFC route (Access 4 → Élite). Ta catégorie
          connue est « {season.category ?? "inconnue"} » : dis-nous la bonne avec « Une info manque ».
        </p>
      </section>
    );
  }

  const a = assess({
    category: season.category,
    gender: season.gender,
    results: season.results,
    cpp: season.cpp,
    cppRank: season.cppRank,
  });

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <TrendingUp className="size-4 text-primary" /> Ma catégorie
        <span className="ml-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium">{ladderLabel(a.category)}</span>
      </h2>
      <p className="mb-3 text-sm">{a.verdict}</p>

      {a.next && (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label={`victoires vers ${ladderLabel(a.next)}`} value={`${a.wins} / ${a.winsNeeded}`} good={a.wins >= a.winsNeeded || a.winsAbove >= 1} />
          {a.winsAbove > 0 && <Stat label="victoires au-dessus · une suffit" value={`${a.winsAbove} / 1`} good />}
          {a.pointsNeeded != null && <Stat label="points au barème 6-4-3-2-1" value={`${a.points} / ${a.pointsNeeded}`} good={a.points >= a.pointsNeeded} />}
          <Stat label={`départs saison ${season.season}`} value={String(a.raced)} />
          {a.cpp != null && <Stat label={`classement national${a.cppRank ? ` · ${a.cppRank}e` : ""}`} value={`${a.cpp.toFixed(1).replace(".", ",")} pt`} warn={a.cppFloor != null && a.cpp < a.cppFloor} />}
        </div>
      )}

      {a.scoring.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {a.scoring.map((r) => (
            <li key={`${r.raceDate}-${r.raceName}`} className="flex items-baseline justify-between gap-3">
              <span className="truncate"><span className="font-mono text-xs text-muted-foreground">{r.raceDate}</span> {displayRaceName(r.raceName)}</span>
              <span className="shrink-0 font-mono tabular-nums">{r.rank}e{r.points > 0 ? ` · +${r.points}` : " · au-dessus"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Aucune place dans les cinq premiers cette saison sur {a.raced} départ{a.raced > 1 ? "s" : ""} : rien ne compte encore au barème.
        </p>
      )}

      {a.down && (
        <p className="mt-3 text-sm">
          <Link href="/profil/lettre" className="underline">Préparer la lettre de demande de descente en {ladderLabel(a.down)}</Link>
          <span className="text-muted-foreground"> — à envoyer au comité {a.downWindow}.</span>
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Règles du Titre II route FFC (barème et seuils repris par les comités Grand Est, Normandie, Bretagne). Ton comité peut appliquer des seuils différents : vérifie avant de changer de licence.
      </p>
    </section>
  );
}

function Stat({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className={cn("font-mono text-lg tabular-nums", good && "text-fsgt", warn && "text-accent")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

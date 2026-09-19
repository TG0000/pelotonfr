import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { getCollectorHealth } from "@/lib/db/queries/collectors";
import {
  getQueueSummary,
  getStartlistQueue,
  type QueuedMiss,
  type QueueSummary,
} from "@/lib/db/queries/startlist-queue";
import { StartlistQueue } from "@/components/ops/StartlistQueue";
import { isOperator } from "@/lib/admin";
import { describeAge, type CollectorHealth } from "@/lib/collectors";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "État des données",
  description:
    "Quand chaque source a été collectée pour la dernière fois, et ce qu'elle a rapporté.",
};

export const dynamic = "force-dynamic";

const VERDICT: Record<
  CollectorHealth["verdict"],
  { label: string; dot: string; text: string }
> = {
  ok:      { label: "À jour",       dot: "bg-fsgt",           text: "text-muted-foreground" },
  late:    { label: "En retard",    dot: "bg-accent",         text: "text-accent" },
  overdue: { label: "À l'arrêt",    dot: "bg-destructive",    text: "text-destructive" },
  never:   { label: "Jamais lancé", dot: "bg-destructive",    text: "text-destructive" },
  // Une sortie volontaire n'est pas une panne, et ne doit pas en avoir la couleur.
  off:     { label: "Désactivé",    dot: "bg-muted-foreground", text: "text-muted-foreground" },
  manual:  { label: "À la demande", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

/**
 * Ce que le collecteur a rapporté, dit selon ce qu'il fait.
 *
 * Une moisson se juge sur son dernier passage : elle doit garder ce qu'elle
 * voit, et l'écart d'une nuit est la panne. Un collecteur d'examen ouvre des
 * pages pour savoir si elles ont du neuf, et la plupart n'en ont pas : son
 * dernier ratio ne veut rien dire, son rendement de la semaine, si.
 */
function rendement(h: CollectorHealth): string {
  if (h.kind === "maintenance") {
    return h.runsWeek > 0
      ? `${nombre(h.runsWeek)} passage${h.runsWeek > 1 ? "s" : ""} cette semaine`
      : "aucun passage cette semaine";
  }
  if (h.kind === "scan") {
    if (h.seenWeek === 0) return "rien à examiner cette semaine";
    const ont = h.writtenWeek > 1 ? "ont" : "a";
    return `${nombre(h.seenWeek)} examinés cette semaine, ${nombre(h.writtenWeek)} ${ont} donné quelque chose`;
  }
  if (h.itemsSeen == null || h.itemsWritten == null) return "aucune collecte enregistrée";
  return `${nombre(h.itemsWritten)} sur ${nombre(h.itemsSeen)} retenus`;
}

function Ligne({ h }: { h: CollectorHealth }) {
  const v = VERDICT[h.verdict];
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", v.dot)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{h.label}</div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{rendement(h)}</span>
          {h.shortfall && (
            <span className="ml-2 text-accent">
              {h.kind === "scan" ? "· une semaine sans rien rapporter" : "· écart important"}
            </span>
          )}
        </div>
        {h.verdict === "off" && h.lastError && (
          <div className="mt-1 truncate text-xs text-muted-foreground">
            Volontairement à l&apos;arrêt : {h.lastError}
          </div>
        )}
        {h.lastStatus === "failed" && h.lastError && (
          <div className="mt-1 truncate text-xs text-destructive">
            Dernière tentative en échec : {h.lastError}
          </div>
        )}
      </div>
      <div className={cn("shrink-0 text-right text-xs", v.text)}>
        <div className="font-medium">{v.label}</div>
        <div className="font-mono tabular-nums text-muted-foreground">
          {describeAge(h.ageHours)}
        </div>
      </div>
    </div>
  );
}

export default async function EtatPage() {
  let health: CollectorHealth[] = [];
  let misses: QueuedMiss[] = [];
  let summary: QueueSummary = {
    open: 0, arbitrable: 0, aucuneCourse: 0, sansCommune: 0, sansEngages: 0, resolved: 0,
  };
  try {
    [health, misses, summary] = await Promise.all([
      getCollectorHealth(),
      getStartlistQueue(),
      getQueueSummary(),
    ]);
  } catch {
    // DB not configured
  }

  const canArbitrate = await isOperator();

  const broken = health.filter(
    (h) => h.verdict === "overdue" || h.verdict === "never"
  );

  /* Trois groupes, parce qu'ils ne se lisent pas de la même façon : ce qui
     fait exister une course, ce qu'on va chercher course par course, et ce
     qui répare l'existant. Onze collecteurs tournaient chaque nuit sans
     apparaître ici, faute d'être déclarés. */
  const groupes: Array<[string, string, CollectorHealth[]]> = [
    [
      "Ce qui fait la course",
      "Tout ce qui est vu doit être gardé : un écart est une panne.",
      health.filter((h) => h.kind === "harvest"),
    ],
    [
      "Ce qu'on va chercher en plus",
      "On ouvre pour voir ; la plupart n'ont rien de neuf. C'est le rendement de la semaine qui parle.",
      health.filter((h) => h.kind === "scan"),
    ],
    [
      "Entretien",
      "Rien de neuf n'entre ; ce qui est là se corrige.",
      health.filter((h) => h.kind === "maintenance"),
    ],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h1 className="text-3xl font-bold">État des données</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Chaque source dit quand elle a été collectée pour la dernière fois et
          ce qu&apos;elle a rapporté. Une collecte qui s&apos;arrête se voit ici
          avant de se voir dans le calendrier.
        </p>
      </header>

      {broken.length > 0 && (
        <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <b>{`${broken.length} source${broken.length > 1 ? "s" : ""} à l'arrêt.`}</b>{" "}
          Les courses affichées peuvent être incomplètes ou périmées.
        </p>
      )}

      {groupes.map(([titre, sous_titre, lignes]) =>
        lignes.length === 0 ? null : (
          <section key={titre} className="mb-8">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {titre}
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">{sous_titre}</p>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
              {lignes.map((h) => (
                <Ligne key={h.key} h={h} />
              ))}
            </div>
          </section>
        )
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">Listes d&apos;engagés en attente</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          La presse régionale publie une liste par course. La rattacher est un
          jugement : même jour, même commune, catégories compatibles. Le nom
          seul ne suffit pas — il proposait le Tour de la Boëme, en Charente,
          pour la liste du Tour de l&apos;Orne. Une commune nommée par
          l&apos;adresse doit aussi se trouver à portée de voiture de la
          course, sans quoi rien n&apos;est proposé.
        </p>
        <StartlistQueue
          misses={misses}
          summary={summary}
          canArbitrate={canArbitrate}
        />
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        Un contrôle indépendant passe chaque matin et prévient par email quand
        une source dépasse son délai. Il tourne chez Vercel plutôt que dans le
        collecteur lui-même : une alarme installée dans la chose qu&apos;elle
        surveille s&apos;éteint avec elle.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { getCollectorHealth } from "@/lib/db/queries/collectors";
import {
  getQueueSummary,
  getStartlistQueue,
  type QueuedMiss,
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
  ok:      { label: "À jour",       dot: "bg-fsgt",        text: "text-muted-foreground" },
  late:    { label: "En retard",    dot: "bg-accent",      text: "text-accent" },
  overdue: { label: "À l'arrêt",    dot: "bg-destructive", text: "text-destructive" },
  never:   { label: "Jamais lancé", dot: "bg-destructive", text: "text-destructive" },
};

export default async function EtatPage() {
  let health: CollectorHealth[] = [];
  let misses: QueuedMiss[] = [];
  let summary = { open: 0, arbitrable: 0, resolved: 0 };
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

      <div className="divide-y divide-border rounded-xl border border-border bg-surface-1">
        {health.map((h) => {
          const v = VERDICT[h.verdict];
          // A run that sees a great deal and keeps little exits zero, so the
          // shortfall has to be stated rather than inferred from a green tick.
          const shortfall =
            h.itemsSeen != null &&
            h.itemsWritten != null &&
            h.itemsSeen > 20 &&
            h.itemsWritten < h.itemsSeen * 0.5;

          return (
            <div key={h.key} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", v.dot)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{h.label}</div>
                <div className="text-xs text-muted-foreground">
                  {h.itemsSeen != null && h.itemsWritten != null ? (
                    <span className="font-mono tabular-nums">
                      {h.itemsWritten.toLocaleString("fr-FR")} sur{" "}
                      {h.itemsSeen.toLocaleString("fr-FR")} retenus
                    </span>
                  ) : (
                    "aucune collecte enregistrée"
                  )}
                  {shortfall && (
                    <span className="ml-2 text-accent">· écart important</span>
                  )}
                </div>
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
        })}
      </div>

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-bold">Listes d&apos;engagés en attente</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          La presse régionale publie une liste par course. La rattacher est un
          jugement : même jour, même commune, catégories compatibles. Au-dessus
          du seuil on l&apos;applique ; en dessous, la liste attend ici plutôt
          que d&apos;être rattachée au hasard.
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

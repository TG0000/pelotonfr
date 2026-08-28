"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Clock, RotateCcw, Users } from "lucide-react";
import type { QueuedRace } from "@/lib/db/queries/club";
import { annulerEngage, marquerEngage } from "@/app/(main)/club/actions";
import { displayRaceName } from "@/lib/race-name";
import { cn } from "@/lib/utils";

/**
 * La file du responsable.
 *
 * Triée par l'heure de clôture, pas par la date de course : ce qui décide,
 * c'est quand la porte se ferme. Et elle se vide — une course traitée
 * disparaît, ce qu'un tableur partagé ne fait jamais.
 */
export function ClubQueue({
  races,
  canAct,
}: {
  races: QueuedRace[];
  canAct: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Record<string, string>>({});

  const waiting = races.filter((r) => !r.handled);
  const done = races.filter((r) => r.handled);

  if (races.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface-1 px-4 py-6 text-sm text-muted-foreground">
        Rien à engager. Une course apparaît ici dès qu&apos;un coureur du club la
        passe en « programmée » dans son calendrier — pas en « envisagée », qui
        est une liste de souhaits et pas une demande.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {waiting.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            À engager
          </h2>
          <div className="flex flex-col gap-3">
            {waiting.map((race) => (
              <RaceRow
                key={race.raceId}
                race={race}
                canAct={canAct}
                pending={pending}
                note={note[race.raceId]}
                onAct={() =>
                  startTransition(async () => {
                    const r = await marquerEngage(race.raceId);
                    setNote((n) => ({ ...n, [race.raceId]: r.message }));
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Engagées
          </h2>
          <div className="flex flex-col gap-3">
            {done.map((race) => (
              <RaceRow
                key={race.raceId}
                race={race}
                canAct={canAct}
                pending={pending}
                note={note[race.raceId]}
                undo
                onAct={() =>
                  startTransition(async () => {
                    const r = await annulerEngage(race.raceId);
                    setNote((n) => ({ ...n, [race.raceId]: r.message }));
                  })
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** L'échéance, dite comme on la dirait à voix haute. */
function deadline(race: QueuedRace): {
  text: string;
  urgent: boolean;
} {
  if (race.hoursLeft == null) return { text: "clôture inconnue", urgent: false };
  const h = race.hoursLeft;
  if (h < 0) return { text: "clôturé", urgent: false };
  if (h < 24) return { text: `ferme dans ${Math.round(h)} h`, urgent: true };
  const days = Math.round(h / 24);
  return {
    text: `ferme dans ${days} jour${days > 1 ? "s" : ""}`,
    urgent: days <= 2,
  };
}

function RaceRow({
  race,
  canAct,
  pending,
  note,
  undo = false,
  onAct,
}: {
  race: QueuedRace;
  canAct: boolean;
  pending: boolean;
  note?: string;
  undo?: boolean;
  onAct: () => void;
}) {
  const when = deadline(race);

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-1 p-4",
        when.urgent && !race.handled ? "border-destructive/50" : "border-border"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link
          href={`/course/${race.raceId}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {displayRaceName(race.name)}
        </Link>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            when.urgent ? "font-medium text-destructive" : "text-muted-foreground"
          )}
        >
          <Clock className="size-3.5" />
          {when.text}
          {!race.closeIsStated && race.hoursLeft != null && (
            <span
              className="text-muted-foreground"
              title="Échéance déduite : la plupart ferment à 20 h trois jours avant, mais la fiche n\u2019a rien dit pour celle-ci."
            >
              (déduit)
            </span>
          )}
        </span>
      </div>

      <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
        {new Date(`${race.raceDate}T12:00:00`).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        {race.city && ` · ${race.city}`}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Users className="size-3.5 shrink-0 text-muted-foreground" />
        {race.riders.map((rider) => (
          <span
            key={rider.userId}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              rider.confirmed
                ? "border-fsgt/40 bg-fsgt/10"
                : "border-border bg-surface-2"
            )}
            title={
              rider.confirmed
                ? "Trouvé sur la liste des partants publiée"
                : undefined
            }
          >
            {rider.confirmed && <CheckCircle2 className="size-3 text-fsgt" />}
            {rider.name}
          </span>
        ))}
      </div>

      {race.startListOut && (
        <p className="mt-2 text-xs text-muted-foreground">
          La liste des partants est parue : les noms cochés y figurent.
        </p>
      )}

      {note ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-fsgt">
          <Check className="size-3.5" />
          {note}
        </p>
      ) : (
        canAct && (
          <button
            type="button"
            disabled={pending}
            onClick={onAct}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
              "hover:bg-surface-2 disabled:opacity-50"
            )}
          >
            {undo ? (
              <>
                <RotateCcw className="size-3.5" />
                Remettre dans la file
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                J&apos;ai engagé
              </>
            )}
          </button>
        )
      )}
    </div>
  );
}

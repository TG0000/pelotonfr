"use client";

import { Bookmark, Check, Plus } from "lucide-react";
import { SignInButton } from "@clerk/nextjs";
import { usePlan } from "@/hooks/usePlan";
import type { RaceIntent } from "@/lib/db/queries/plan";
import { cn } from "@/lib/utils";

/**
 * Putting a race on the rider's calendar, at one of two strengths.
 *
 * A rider does two different things with an épreuve they have spotted:
 * shortlist it while they decide, and commit to it once they have. Collapsing
 * both into one "favourite" made the season plan unreadable — you could not
 * tell what was actually being ridden from what was merely being considered.
 *
 * The control cycles rather than opening a menu: three states are few enough
 * that a second click is faster than a choice, and the label always says what
 * the current state is rather than what the click will do.
 */

const NEXT: Record<string, RaceIntent | null> = {
  none: "envisagee",
  envisagee: "programmee",
  programmee: null,
};

export function PlanButton({
  raceId,
  className,
  compact = false,
}: {
  raceId: string;
  className?: string;
  /** Icon only, for a dense list. */
  compact?: boolean;
}) {
  const { plan, set, isSignedIn } = usePlan();
  const intent = plan.get(raceId) ?? null;
  const state = intent ?? "none";

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          title="Connectez-vous pour construire votre calendrier"
          aria-label="Connectez-vous pour construire votre calendrier"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5",
            "text-xs text-muted-foreground transition-colors hover:bg-surface-2",
            className
          )}
        >
          <Plus className="size-3.5" />
          {!compact && "Ajouter"}
        </button>
      </SignInButton>
    );
  }

  const label =
    intent === "programmee"
      ? "Au programme"
      : intent === "envisagee"
        ? "Envisagée"
        : "Ajouter";

  const Icon =
    intent === "programmee" ? Check : intent === "envisagee" ? Bookmark : Plus;

  return (
    <button
      type="button"
      onClick={(e) => {
        // The control often sits inside a link to the race.
        e.preventDefault();
        e.stopPropagation();
        void set(raceId, NEXT[state]);
      }}
      aria-pressed={intent !== null}
      title={
        intent === "programmee"
          ? "Au programme — cliquez pour retirer"
          : intent === "envisagee"
            ? "Envisagée — cliquez pour confirmer"
            : "Ajouter à mon calendrier"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
        intent === "programmee" &&
          "border-fsgt/40 bg-fsgt/10 font-medium text-fsgt",
        intent === "envisagee" &&
          "border-accent/40 bg-accent/10 font-medium text-accent",
        intent === null &&
          "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        className
      )}
    >
      <Icon className={cn("size-3.5", intent === "envisagee" && "fill-current")} />
      {!compact && label}
    </button>
  );
}

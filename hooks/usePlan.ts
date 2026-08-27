"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { RaceIntent } from "@/lib/db/queries/plan";

const NONE: ReadonlyMap<string, RaceIntent> = new Map();

/**
 * The rider's calendar, shared by every control that can change it.
 *
 * Updates optimistically and rolls back on failure: marking a race is a small
 * act that should feel instant, and a spinner on a bookmark is worse than a
 * rare correction.
 */
export function usePlan() {
  const { isSignedIn } = useAuth();
  const [intents, setIntents] = useState<Map<string, RaceIntent>>(new Map());

  useEffect(() => {
    if (!isSignedIn) return;

    let live = true;
    fetch("/api/plan")
      .then((r) => r.json())
      .then((data: { intents: Record<string, RaceIntent> }) => {
        if (live) setIntents(new Map(Object.entries(data.intents ?? {})));
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [isSignedIn]);

  const plan = isSignedIn ? intents : NONE;

  const set = useCallback(
    async (raceId: string, intent: RaceIntent | null) => {
      if (!isSignedIn) return;

      const previous = intents.get(raceId) ?? null;
      setIntents((prev) => {
        const next = new Map(prev);
        if (intent === null) next.delete(raceId);
        else next.set(raceId, intent);
        return next;
      });

      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raceId, intent }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setIntents((prev) => {
          const next = new Map(prev);
          if (previous === null) next.delete(raceId);
          else next.set(raceId, previous);
          return next;
        });
      }
    },
    [isSignedIn, intents]
  );

  return { plan, set, isSignedIn };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

/** Shared so a signed-out render always returns the same reference. */
const NONE: ReadonlySet<string> = new Set();

export function useFavorites() {
  const { isSignedIn } = useAuth();
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isSignedIn) return;

    // A response arriving after sign-out (or after the component is gone)
    // must not be written back.
    let live = true;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((data: { favoriteIds: string[] }) => {
        if (live) setSaved(new Set(data.favoriteIds));
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [isSignedIn]);

  /* Signing out empties the list by derivation rather than by clearing state
     from an effect, which used to cost an extra render pass on every auth
     change — and left the previous user's favourites on screen until it ran. */
  const favoriteIds = isSignedIn ? saved : NONE;

  const toggle = useCallback(
    async (raceId: string) => {
      if (!isSignedIn) return;

      const wasFavorite = saved.has(raceId);

      setSaved((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(raceId);
        else next.add(raceId);
        return next;
      });

      try {
        if (wasFavorite) {
          await fetch(`/api/favorites/${raceId}`, { method: "DELETE" });
        } else {
          await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raceId }),
          });
        }
      } catch {
        setSaved((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(raceId);
          else next.delete(raceId);
          return next;
        });
      }
    },
    [isSignedIn, saved]
  );

  return { favoriteIds, toggle };
}

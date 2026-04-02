"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

export function useFavorites() {
  const { isSignedIn } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setFavoriteIds(new Set());
      return;
    }
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((data: { favoriteIds: string[] }) => {
        setFavoriteIds(new Set(data.favoriteIds));
      })
      .catch(() => {});
  }, [isSignedIn]);

  const toggle = useCallback(
    async (raceId: string) => {
      if (!isSignedIn) return;

      const isFav = favoriteIds.has(raceId);

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(raceId);
        else next.add(raceId);
        return next;
      });

      try {
        if (isFav) {
          await fetch(`/api/favorites/${raceId}`, { method: "DELETE" });
        } else {
          await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raceId }),
          });
        }
      } catch {
        // Rollback on error
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(raceId);
          else next.delete(raceId);
          return next;
        });
      }
    },
    [isSignedIn, favoriteIds]
  );

  return { favoriteIds, toggle, loading };
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { RaceFilters, useActiveFilterCount } from "./RaceFilters";

/**
 * The filter panel, folded away and remembered.
 *
 * A rider sets their filters once — their region, their categories, a radius —
 * and then spends the next hour building a season out of the results. Making
 * them set it again on every visit, and giving the controls a permanent third
 * of the screen while they read, both get in the way of the actual work.
 *
 * So the panel collapses, and the filters survive the visit. They stay in the
 * URL, which keeps a filtered view shareable and the back button meaningful;
 * what is remembered is simply the last URL, replayed when a rider returns to
 * an unfiltered calendar.
 */

const STORAGE_KEY = "pelotonfr.filters";
const FOLD_KEY = "pelotonfr.filters.folded";

/** Only what describes a search. Paging and the chosen view are not filters. */
const REMEMBERED = [
  "fed", "disc", "cat", "q",
  "lat", "lng", "radius", "lieu",
  "dateFrom", "dateTo",
];

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // A browser refusing storage still gets working filters, just no memory.
    return null;
  }
}

export function FilterPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCount = useActiveFilterCount();

  /* Ouvert jusqu'à ce qu'on demande le contraire.
     Il se repliait dès le premier filtre coché, ce qui est le mauvais moment :
     on en coche plusieurs jusqu'à décrire ce qu'on cherche, et c'est seulement
     après qu'on veut la place. Le repli est donc une décision — le bouton
     « Voir les courses », ou la flèche — et elle se garde d'une visite à
     l'autre comme les filtres eux-mêmes. */
  /* Le pli retenu de la dernière visite, lu à la source plutôt que recopié
     dans un état par un effet — React 19 interdit le second, et à raison :
     c'était une valeur en double dont l'une corrigeait l'autre après coup. */
  const persistedFold = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(FOLD_KEY) !== null;
      } catch {
        return false;
      }
    },
    () => false
  );

  /** Le choix fait dans cette visite, qui l'emporte sur ce qui était retenu. */
  const [override, setOverride] = useState<boolean | null>(null);
  const open = !(override ?? persistedFold);

  function fold(value: boolean) {
    setOverride(value);
    try {
      if (value) localStorage.setItem(FOLD_KEY, "1");
      else localStorage.removeItem(FOLD_KEY);
    } catch {
      // Le pli marche quand même, il ne sera juste pas retenu.
    }
  }

  /* Whether we are past hydration, without an effect that sets state to say so. */
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  /* Remember what the rider searched for. */
  useEffect(() => {
    if (!hydrated) return;
    const kept = new URLSearchParams();
    for (const key of REMEMBERED) {
      for (const value of searchParams.getAll(key)) kept.append(key, value);
    }
    try {
      const serialised = kept.toString();
      if (serialised) localStorage.setItem(STORAGE_KEY, serialised);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: the filters still work, they just will not be recalled.
    }
  }, [searchParams, hydrated]);

  /* Replay them when a rider comes back to an unfiltered calendar. */
  useEffect(() => {
    if (!hydrated || activeCount > 0) return;

    const saved = readSaved();
    if (!saved) return;

    const params = new URLSearchParams(searchParams.toString());
    const savedParams = new URLSearchParams(saved);
    let changed = false;
    for (const [key, value] of savedParams) {
      params.append(key, value);
      changed = true;
    }
    if (!changed) return;

    // Replaced rather than pushed: returning to the calendar should not put a
    // filterless page in the history for the back button to land on.
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function forget() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.push(pathname, { scroll: false });
  }

  /* Replié, la colonne s'efface au lieu de garder ses 256 pixels : replier vers
     le haut ne rendait aucune place au calendrier, qui est ce qu'on est venu
     lire. */
  if (!open) {
    return (
      <aside className="hidden shrink-0 lg:block">
        <div className="sticky top-20 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fold(false)}
            aria-expanded={false}
            title="Afficher les filtres"
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-3 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
            <SlidersHorizontal className="size-4" />
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            Filtres
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={forget}
              title="Oublier ces filtres"
              aria-label="Oublier ces filtres"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => fold(true)}
            aria-expanded
            title="Replier les filtres"
            aria-label="Replier les filtres"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>

        <RaceFilters />

        <button
          type="button"
          onClick={() => fold(true)}
          className="sticky bottom-0 mt-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Voir les courses
        </button>
      </div>
    </aside>
  );
}

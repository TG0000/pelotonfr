"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { RaceFilters, useActiveFilterCount } from "./RaceFilters";
import { cn } from "@/lib/utils";

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

  /* Open unless the rider has already narrowed something down — derived
     rather than synchronised, so no render is spent correcting a first guess.
     `override` records a deliberate fold or unfold and wins from then on. */
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? activeCount === 0;

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOverride(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
        >
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filtres
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
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
      </div>

      {open && <RaceFilters />}

      {!open && activeCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Vos filtres sont conservés d&apos;une visite à l&apos;autre.
        </p>
      )}
    </div>
  );
}

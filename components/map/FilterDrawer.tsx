"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { RaceFilters, useActiveFilterCount } from "@/components/races/RaceFilters";
import { cn } from "@/lib/utils";

/**
 * The map's filters — the same component the list uses.
 *
 * The map used to carry its own controls with a different set of categories
 * and a different set of period presets, so narrowing a search in one place
 * left the other showing something else. There is one filter surface now; the
 * map only decides whether it is folded away, because the results list beside
 * it wants the room.
 */
export function FilterDrawer() {
  const searchParams = useSearchParams();
  const activeCount = useActiveFilterCount();
  // A panel that hides active filters is worse than one that takes up room.
  const [open, setOpen] = useState(activeCount > 0);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-surface-2"
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

      {open && (
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
          <RaceFilters key={searchParams.toString()} />
        </div>
      )}
    </div>
  );
}

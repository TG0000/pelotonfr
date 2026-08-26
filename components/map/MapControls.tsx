"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { LocationSearch } from "@/components/common/LocationSearch";
import { FEDERATIONS, DEFAULT_RADIUS_KM } from "@/lib/constants";
import { CATEGORIES as CATEGORY_DEFS } from "@/lib/categories";
import { toDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { GeocodingResult } from "@/types";

/**
 * The map's own controls.
 *
 * The map used to carry a second, drifting copy of the sidebar — a different
 * category list, a different set of presets. This is deliberately smaller:
 * where, when, which federation. Anything finer belongs on the list page.
 */

const RADII = [25, 50, 100, 150];

/** The senior road ladder only: the map is a "where can I race" view. */
const QUICK_CATEGORIES = CATEGORY_DEFS.filter(
  (c) => c.group === "ffc" && !c.value.startsWith("cat")
);

export function MapControls({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const setParams = useCallback(
    (entries: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.getAll(key);
      params.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      next.forEach((v) => params.append(key, v));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const fed = searchParams.getAll("fed");
  const cat = searchParams.getAll("cat");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = Number(searchParams.get("radius") ?? DEFAULT_RADIUS_KM);
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const weekend = useMemo(() => {
    const today = new Date();
    const sat = new Date(today);
    sat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    return { from: toDateOnly(sat) ?? "", to: toDateOnly(sun) ?? "" };
  }, []);

  const month = useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 30);
    return { from: toDateOnly(today) ?? "", to: toDateOnly(end) ?? "" };
  }, []);

  const activeCount =
    fed.length + cat.length + (lat && lng ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

  function handleLocation(result: GeocodingResult | null) {
    if (result) {
      setParams({
        lat: String(result.lat),
        lng: String(result.lng),
        radius: searchParams.get("radius") ?? String(DEFAULT_RADIUS_KM),
      });
    } else {
      setParams({ lat: "", lng: "", radius: "" });
    }
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface-1 hover:border-primary/50 hover:bg-surface-2"
    );

  const showDetail = !compact || expanded;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <LocationSearch onSelect={handleLocation} placeholder="Ville ou code postal…" />
        </div>
        {compact && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className={cn(
              "relative shrink-0 rounded-lg border border-border p-2",
              expanded && "bg-surface-2"
            )}
            aria-label="Filtres"
          >
            <SlidersHorizontal className="size-4" />
            {activeCount > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        )}
      </div>

      {showDetail && (
        <>
          {lat && lng && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Rayon</span>
              {RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => setParams({ radius: String(r) })}
                  className={pill(radius === r)}
                >
                  {r} km
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {FEDERATIONS.map((f) => (
              <button
                key={f.slug}
                onClick={() => toggle("fed", f.slug)}
                className={pill(fed.includes(f.slug))}
              >
                {f.name}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button
              onClick={() =>
                setParams(
                  dateFrom === weekend.from && dateTo === weekend.to
                    ? { dateFrom: "", dateTo: "" }
                    : { dateFrom: weekend.from, dateTo: weekend.to }
                )
              }
              className={pill(dateFrom === weekend.from && dateTo === weekend.to)}
            >
              Week-end
            </button>
            <button
              onClick={() =>
                setParams(
                  dateFrom === month.from && dateTo === month.to
                    ? { dateFrom: "", dateTo: "" }
                    : { dateFrom: month.from, dateTo: month.to }
                )
              }
              className={pill(dateFrom === month.from && dateTo === month.to)}
            >
              30 jours
            </button>
          </div>

          <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
            {QUICK_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => toggle("cat", c.value)}
                className={cn(pill(cat.includes(c.value)), "shrink-0")}
              >
                {c.label}
              </button>
            ))}
          </div>

          {activeCount > 0 && (
            <button
              onClick={() => router.push(pathname, { scroll: false })}
              className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Tout effacer
            </button>
          )}
        </>
      )}
    </div>
  );
}

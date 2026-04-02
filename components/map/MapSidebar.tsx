"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { LocationSearch } from "@/components/common/LocationSearch";
import { FEDERATIONS, DISCIPLINES, CATEGORIES, DEFAULT_RADIUS_KM } from "@/lib/constants";
import type { GeocodingResult } from "@/types";

type MultiKey = "fed" | "disc" | "cat";

export function MapSidebar({
  raceCount,
  onLocationChange,
}: {
  raceCount: number;
  onLocationChange: (result: GeocodingResult | null) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(true);

  const radius = Number(searchParams.get("radius") ?? DEFAULT_RADIUS_KM);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const getValues = (key: string) => searchParams.getAll(key);

  const updateParam = useCallback(
    (key: string, value: string, checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.getAll(key);
      params.delete(key);
      if (checked) {
        [...current, value].forEach((v) => params.append(key, v));
      } else {
        current.filter((v) => v !== value).forEach((v) => params.append(key, v));
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  function handleRadiusChange(val: number | readonly number[]) {
    const v = Array.isArray(val) ? (val as number[])[0] : (val as number);
    const params = new URLSearchParams(searchParams.toString());
    params.set("radius", String(v));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleLocationSelect(result: GeocodingResult | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (result) {
      params.set("lat", String(result.lat));
      params.set("lng", String(result.lng));
      if (!params.has("radius")) params.set("radius", String(DEFAULT_RADIUS_KM));
    } else {
      params.delete("lat");
      params.delete("lng");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    onLocationChange(result);
  }

  function clearAll() {
    router.replace(pathname, { scroll: false });
    onLocationChange(null);
  }

  const hasFilters = searchParams.toString().length > 0;

  function FilterPills({
    items,
    paramKey,
  }: {
    items: Array<{ value: string; label: string }>;
    paramKey: MultiKey;
  }) {
    const active = getValues(paramKey);
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isActive = active.includes(item.value);
          return (
            <button
              key={item.value}
              onClick={() => updateParam(paramKey, item.value, !isActive)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg w-72 overflow-hidden">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" />
          Filtres
          <span className="text-xs text-muted-foreground font-normal">
            ({raceCount} courses)
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t">
          {/* Location + radius */}
          <div className="flex flex-col gap-2 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Localisation
            </h3>
            <LocationSearch
              onSelect={handleLocationSelect}
              placeholder="Ville de départ..."
              defaultValue={lat && lng ? "" : ""}
            />
            {lat && lng && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rayon</span>
                  <span className="font-medium">{radius} km</span>
                </div>
                <Slider
                  min={10}
                  max={300}
                  step={10}
                  value={[radius]}
                  onValueChange={handleRadiusChange}
                  className="w-full"
                />
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fédération
            </h3>
            <FilterPills
              paramKey="fed"
              items={FEDERATIONS.map((f) => ({ value: f.slug, label: f.name }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Discipline
            </h3>
            <FilterPills
              paramKey="disc"
              items={DISCIPLINES.slice(0, 5).map((d) => ({ value: d.value, label: d.label }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catégorie
            </h3>
            <FilterPills
              paramKey="cat"
              items={CATEGORIES.slice(0, 8).map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>

          {hasFilters && (
            <>
              <Separator />
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                className="w-full gap-2"
              >
                <X className="size-3.5" />
                Effacer les filtres
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

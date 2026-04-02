"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FEDERATIONS, DISCIPLINES, CATEGORIES, RACE_LEVELS } from "@/lib/constants";

type MultiKey = "fed" | "disc" | "cat";

export function RaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getValues = useCallback(
    (key: string) => searchParams.getAll(key),
    [searchParams]
  );

  const updateParam = useCallback(
    (key: string, value: string, checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.getAll(key);

      params.delete(key);
      params.delete("page");

      if (checked) {
        [...current, value].forEach((v) => params.append(key, v));
      } else {
        current.filter((v) => v !== value).forEach((v) => params.append(key, v));
      }

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  const hasFilters =
    searchParams.toString().length > 0 &&
    searchParams.toString() !== "page=1";

  const fedValues = getValues("fed");
  const discValues = getValues("disc");
  const catValues = getValues("cat");
  const q = searchParams.get("q") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  function FilterGroup({
    title,
    items,
    paramKey,
    activeValues,
  }: {
    title: string;
    items: Array<{ value: string; label: string }>;
    paramKey: MultiKey;
    activeValues: string[];
  }) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const active = activeValues.includes(item.value);
            return (
              <button
                key={item.value}
                onClick={() => updateParam(paramKey, item.value, !active)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50 hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <aside className="w-full flex flex-col gap-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une course, ville..."
          className="pl-9"
          value={q}
          onChange={(e) => setParam("q", e.target.value)}
        />
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Période
        </h3>
        <div className="flex gap-2 items-center">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setParam("dateFrom", e.target.value)}
            className="text-xs"
          />
          <span className="text-muted-foreground text-sm shrink-0">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setParam("dateTo", e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      <Separator />

      <FilterGroup
        title="Fédération"
        paramKey="fed"
        activeValues={fedValues}
        items={FEDERATIONS.map((f) => ({ value: f.slug, label: f.name }))}
      />

      <FilterGroup
        title="Discipline"
        paramKey="disc"
        activeValues={discValues}
        items={DISCIPLINES.map((d) => ({ value: d.value, label: d.label }))}
      />

      <FilterGroup
        title="Catégorie"
        paramKey="cat"
        activeValues={catValues}
        items={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
      />

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
            Effacer tous les filtres
          </Button>
        </>
      )}
    </aside>
  );
}

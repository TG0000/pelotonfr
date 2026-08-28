"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadiusSlider } from "./RadiusSlider";
import { LocationSearch } from "@/components/common/LocationSearch";
import { FEDERATIONS, DISCIPLINES, DEFAULT_RADIUS_KM } from "@/lib/constants";
import { CATEGORIES as CATEGORY_DEFS } from "@/lib/categories";
import { toDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { GeocodingResult } from "@/types";



/**
 * Categories, as a rider thinks of them.
 *
 * The old list was a single wall of pills built from a hand-written copy of the
 * vocabulary in lib/constants — and that copy had drifted: it offered "Open2"
 * and "Cadets" while the scrapers write "open2" and "u17", so most of the
 * filters matched nothing. Sourcing the canonical vocabulary directly makes
 * that class of drift impossible.
 */
const CATEGORY_SECTIONS: Array<{
  title: string;
  values: string[];
  /** Sections a rider rarely wants start closed. */
  defaultOpen: boolean;
}> = [
  {
    title: "Route FFC",
    values: CATEGORY_DEFS.filter(
      (c) => c.group === "ffc" && !c.value.startsWith("cat")
    ).map((c) => c.value),
    defaultOpen: true,
  },
  {
    title: "FSGT",
    values: CATEGORY_DEFS.filter((c) => c.group === "fsgt").map((c) => c.value),
    defaultOpen: false,
  },
  {
    title: "Jeunes",
    values: CATEGORY_DEFS.filter((c) => c.group === "youth").map((c) => c.value),
    defaultOpen: false,
  },
  {
    title: "Autres",
    values: CATEGORY_DEFS.filter(
      (c) => c.group === "women" || (c.group === "other" && c.value !== "staff")
    ).map((c) => c.value),
    defaultOpen: false,
  },
];

const LABEL_BY_VALUE = new Map(CATEGORY_DEFS.map((c) => [c.value, c.label]));

/** A short label: the sidebar has no room for "U17 (Cadet)". */
function shortLabel(value: string): string {
  const full = LABEL_BY_VALUE.get(value) ?? value;
  return full.replace(/\s*\(.*\)$/, "");
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-xs px-2.5 py-1 rounded-full border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-surface-1 border-border hover:border-primary/50 hover:bg-surface-2"
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
      {count ? (
        <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
          {count}
        </span>
      ) : null}
    </h3>
  );
}

/** A section that can be folded away, so the sidebar stays scannable. */
function Collapsible({
  title,
  activeCount,
  defaultOpen,
  children,
}: {
  title: string;
  activeCount: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  // A section holding an active filter must never hide it.
  const [open, setOpen] = useState(defaultOpen || activeCount > 0);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <SectionTitle count={activeCount}>{title}</SectionTitle>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * Every filter, in one place.
 *
 * "Près de moi" used to be offered only on the list, so switching to the
 * calendar silently dropped a distance the rider had set — the filter was
 * still in the URL, still applied by some queries and not others. One surface
 * means one set of filters, always the same ones.
 */
export function RaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string, checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.getAll(key);
      params.delete(key);
      params.delete("page");
      const next = checked
        ? [...current, value]
        : current.filter((v) => v !== value);
      next.forEach((v) => params.append(key, v));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setParams = useCallback(
    (entries: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      for (const [key, value] of Object.entries(entries)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  const fedValues = searchParams.getAll("fed");
  const discValues = searchParams.getAll("disc");
  const catValues = searchParams.getAll("cat");
  const urlQuery = searchParams.get("q") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const place = searchParams.get("lieu") ?? "";
  const radius = Number(searchParams.get("radius") ?? DEFAULT_RADIUS_KM);

  /* Search: typed locally, pushed on a pause.
     Navigating on every keystroke re-ran the query letter by letter and the
     input lost its place mid-word — the single worst thing about the old page. */
  const [query, setQuery] = useState(urlQuery);
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (query === urlQuery) return;
    const id = setTimeout(() => {
      typing.current = false;
      setParams({ q: query });
    }, 350);
    return () => clearTimeout(id);
  }, [query, urlQuery, setParams]);

  function handleLocationSelect(result: GeocodingResult | null) {
    if (result) {
      setParams({
        lat: String(result.lat),
        lng: String(result.lng),
        // The name travels with the coordinates. Without it the field came
        // back empty on every reload, so an active distance filter looked
        // like no filter at all — and a rider reasonably concluded the
        // control had disappeared.
        lieu: result.label,
        radius: searchParams.get("radius") ?? String(DEFAULT_RADIUS_KM),
      });
    } else {
      setParams({ lat: "", lng: "", lieu: "" });
    }
  }

  /** Date presets, built from local calendar days rather than UTC instants. */
  const presets = useMemo(() => {
    const today = new Date();
    const iso = (d: Date) => toDateOnly(d) ?? "";

    const saturday = new Date(today);
    saturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);

    const inDays = (n: number) => {
      const d = new Date(today);
      d.setDate(today.getDate() + n);
      return d;
    };

    return [
      { label: "Ce week-end", from: iso(saturday), to: iso(sunday) },
      { label: "7 jours", from: iso(today), to: iso(inDays(7)) },
      { label: "30 jours", from: iso(today), to: iso(inDays(30)) },
    ];
  }, []);

  const activeCount =
    fedValues.length +
    discValues.length +
    catValues.length +
    (urlQuery ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (lat && lng ? 1 : 0);

  return (
    <aside className="flex w-full flex-col gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Course, ville…"
          className="pl-9 pr-8"
          value={query}
          onChange={(e) => {
            typing.current = true;
            setQuery(e.target.value);
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => {
              typing.current = true;
              setQuery("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {(
        <div className="flex flex-col gap-2">
          <SectionTitle>Près de moi</SectionTitle>
          <LocationSearch
            key={place}
            defaultValue={place}
            onSelect={handleLocationSelect}
            placeholder="Ville ou code postal…"
          />
          {lat && lng && (
            <RadiusSlider
              value={radius}
              onCommit={(km) => setParams({ radius: String(km) })}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionTitle>Période</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Pill
              key={p.label}
              active={dateFrom === p.from && dateTo === p.to}
              onClick={() =>
                setParams(
                  dateFrom === p.from && dateTo === p.to
                    ? { dateFrom: "", dateTo: "" }
                    : { dateFrom: p.from, dateTo: p.to }
                )
              }
            >
              {p.label}
            </Pill>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="À partir du"
            value={dateFrom}
            onChange={(e) => setParams({ dateFrom: e.target.value })}
            className="text-xs"
          />
          <span className="shrink-0 text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label="Jusqu'au"
            value={dateTo}
            onChange={(e) => setParams({ dateTo: e.target.value })}
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle count={fedValues.length}>Fédération</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {FEDERATIONS.map((f) => (
            <Pill
              key={f.slug}
              active={fedValues.includes(f.slug)}
              onClick={() =>
                updateParam("fed", f.slug, !fedValues.includes(f.slug))
              }
            >
              {f.name}
            </Pill>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle count={discValues.length}>Discipline</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {DISCIPLINES.map((d) => (
            <Pill
              key={d.value}
              active={discValues.includes(d.value)}
              onClick={() =>
                updateParam("disc", d.value, !discValues.includes(d.value))
              }
            >
              {d.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <SectionTitle count={catValues.length}>Catégorie</SectionTitle>
        {CATEGORY_SECTIONS.map((section) => (
          <Collapsible
            key={section.title}
            title={section.title}
            defaultOpen={section.defaultOpen}
            activeCount={
              section.values.filter((v) => catValues.includes(v)).length
            }
          >
            {section.values.map((value) => (
              <Pill
                key={value}
                active={catValues.includes(value)}
                onClick={() =>
                  updateParam("cat", value, !catValues.includes(value))
                }
              >
                {shortLabel(value)}
              </Pill>
            ))}
          </Collapsible>
        ))}
      </div>

      {activeCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="w-full gap-2"
        >
          <X className="size-3.5" />
          Effacer ({activeCount})
        </Button>
      )}
    </aside>
  );
}

/** The number of active filters, for the mobile trigger's badge. */
export function useActiveFilterCount(): number {
  const searchParams = useSearchParams();
  return (
    searchParams.getAll("fed").length +
    searchParams.getAll("disc").length +
    searchParams.getAll("cat").length +
    (searchParams.get("q") ? 1 : 0) +
    (searchParams.get("dateFrom") || searchParams.get("dateTo") ? 1 : 0) +
    (searchParams.get("lat") && searchParams.get("lng") ? 1 : 0)
  );
}

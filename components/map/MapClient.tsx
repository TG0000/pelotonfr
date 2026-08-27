"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronUp, Crosshair, MapPinned, X } from "lucide-react";
import { FilterDrawer } from "./FilterDrawer";
import {
  CategorySummary,
  DateBlock,
  FEDERATION_BORDER,
  FederationMark,
  parseRaceDate,
  PlaceLabel,
} from "@/components/races/RacePrimitives";
import { EmptyState } from "@/components/common/States";
import { cn } from "@/lib/utils";
import { displayRaceName } from "@/lib/race-name";
import type { Race } from "@/types";

const RaceMap = dynamic(
  () => import("./RaceMap").then((m) => ({ default: m.RaceMap })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-surface-2">
        <span className="text-sm text-muted-foreground">Chargement de la carte…</span>
      </div>
    ),
  }
);

interface MapClientProps {
  races: Race[];
}

/** One race in the panel beside the map. */
function ResultRow({
  race,
  selected,
  onSelect,
}: {
  race: Race;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Selecting on the map should reveal the row, not leave it below the fold.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={ref}
      onMouseEnter={onSelect}
      className={cn(
        "relative cursor-pointer border-l-[3px] px-3 py-2.5 transition-colors",
        selected
          ? cn("bg-surface-2", FEDERATION_BORDER[race.federationSlug] ?? "border-l-primary")
          : "border-l-transparent hover:bg-surface-2/60"
      )}
    >
      <Link href={`/course/${race.id}`} className="flex items-center gap-3 group">
        <DateBlock date={race.raceDate} dateEnd={race.raceDateEnd} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold group-hover:text-primary">
            {displayRaceName(race.name)}
          </div>
          <PlaceLabel race={race} className="block text-xs text-muted-foreground" />
          <div className="mt-0.5 flex items-center gap-2">
            <FederationMark slug={race.federationSlug} withLabel />
            <CategorySummary categories={race.categories} />
          </div>
        </div>
      </Link>
    </div>
  );
}

export function MapClient({ races }: MapClientProps) {
  const searchParams = useSearchParams();

  const userLocation = useMemo(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    return lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  }, [searchParams]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  /* Re-frame the map when the filters change, not when React happens to hand
     down a new array. */
  const fitKey = searchParams.toString();

  const byId = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);

  /** The races inside the current viewport, earliest first. */
  const visible = useMemo(() => {
    const source =
      visibleIds === null
        ? races
        : visibleIds.map((id) => byId.get(id)).filter((r): r is Race => Boolean(r));
    return [...source].sort(
      (a, b) => parseRaceDate(a.raceDate).getTime() - parseRaceDate(b.raceDate).getTime()
    );
  }, [visibleIds, races, byId]);

  const handleVisibleChange = useCallback((ids: string[]) => {
    setVisibleIds(ids);
  }, []);

  const panel = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            {visible.length.toLocaleString("fr-FR")} course
            {visible.length > 1 ? "s" : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            dans la zone affichée
          </div>
        </div>
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2"
            aria-label="Désélectionner"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={Crosshair}
            title="Aucune course dans cette zone"
            action="Dézoomez ou élargissez la période."
          />
        ) : (
          <div className="divide-y divide-border/60">
            {visible.map((race) => (
              <ResultRow
                key={race.id}
                race={race}
                selected={race.id === selectedId}
                onSelect={() => setSelectedId(race.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full w-full">
      {/* Desktop: a permanent list beside the map, the pattern anyone who has
          searched for a place online already knows. */}
      <aside className="hidden w-[22rem] shrink-0 flex-col border-r border-border bg-surface-1 lg:flex xl:w-[24rem]">
        <FilterDrawer />
        {panel}
      </aside>

      <div className="relative min-w-0 flex-1">
        <RaceMap
          races={races}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onVisibleChange={handleVisibleChange}
          userLocation={userLocation}
          fitKey={fitKey}
        />

        {/* Mobile: controls float, results come up as a sheet. */}
        <button
          onClick={() => setSheetOpen(true)}
          className={cn(
            "absolute bottom-4 left-1/2 z-10 -translate-x-1/2 lg:hidden",
            "flex items-center gap-2 rounded-full bg-primary px-4 py-2.5",
            "text-sm font-semibold text-primary-foreground shadow-lg",
            sheetOpen && "hidden"
          )}
        >
          <MapPinned className="size-4" />
          {visible.length} course{visible.length > 1 ? "s" : ""}
          <ChevronUp className="size-4" />
        </button>

        {sheetOpen && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex h-[65%] flex-col rounded-t-2xl border-t border-border bg-surface-1 shadow-2xl lg:hidden">
            <button
              onClick={() => setSheetOpen(false)}
              className="mx-auto my-2 h-1.5 w-10 rounded-full bg-border"
              aria-label="Fermer la liste"
            />
            {panel}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-8 right-3 z-10 hidden rounded-lg border border-border bg-surface-1/90 px-3 py-2 text-xs shadow-sm backdrop-blur sm:block">
          <div className="mb-1.5 font-semibold text-muted-foreground">Fédération</div>
          <div className="flex flex-col gap-1">
            {(["ffc", "fsgt", "ufolep"] as const).map((slug) => (
              <FederationMark key={slug} slug={slug} withLabel />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

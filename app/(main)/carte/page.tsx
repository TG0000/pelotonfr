import { Suspense } from "react";
import type { Metadata } from "next";
import { MapClient } from "@/components/map/MapClient";
import { getRacesForMap } from "@/lib/db/queries/races";
import type { Race, RaceFilters } from "@/types";
import type { FederationSlug, Discipline } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Carte des courses",
  description: "Visualisez toutes les courses cyclistes en France sur une carte interactive",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getString(val: string | string[] | undefined): string {
  if (!val) return "";
  return Array.isArray(val) ? (val[0] ?? "") : val;
}

export default async function CartePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters: Partial<RaceFilters> = {
    fed: getArray(params.fed) as FederationSlug[],
    disc: getArray(params.disc) as Discipline[],
    cat: getArray(params.cat),
    dateFrom: getString(params.dateFrom),
    dateTo: getString(params.dateTo),
    lat: params.lat ? Number(params.lat) : null,
    lng: params.lng ? Number(params.lng) : null,
    radius: Number(getString(params.radius)) || 50,
  };

  let races: Race[] = [];
  try {
    races = await getRacesForMap(filters);
  } catch {
    // DB not configured yet
  }

  return (
    <div style={{ position: "fixed", top: "3.5rem", left: 0, right: 0, bottom: 0 }}>
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center bg-muted/20">
          <span className="text-muted-foreground">Chargement...</span>
        </div>
      }>
        <MapClient initialRaces={races} />
      </Suspense>
    </div>
  );
}

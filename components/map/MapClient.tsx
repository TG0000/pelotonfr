"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { MapSidebar } from "./MapSidebar";
import type { Race, GeocodingResult } from "@/types";

const RaceMap = dynamic(
  () => import("./RaceMap").then((m) => ({ default: m.RaceMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full bg-muted/30 animate-pulse">
        <span className="text-sm text-muted-foreground">Chargement de la carte...</span>
      </div>
    ),
  }
);

interface MapClientProps {
  initialRaces: Race[];
}

export function MapClient({ initialRaces }: MapClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    () => {
      const lat = searchParams.get("lat");
      const lng = searchParams.get("lng");
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
      return null;
    }
  );
  const [races, setRaces] = useState<Race[]>(initialRaces);

  // Sync races when server re-renders with new filter params
  useEffect(() => {
    setRaces(initialRaces);
  }, [initialRaces]);

  const handleLocationChange = useCallback(
    async (result: GeocodingResult | null) => {
      setUserLocation(result ? { lat: result.lat, lng: result.lng } : null);

      if (!result) {
        setRaces(initialRaces);
        return;
      }

      // Fetch races near new location
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", String(result.lat));
      params.set("lng", String(result.lng));

      try {
        const res = await fetch(`/api/races?${params.toString()}`);
        const data = (await res.json()) as { races: Race[] };
        setRaces(data.races);
      } catch {
        // Keep existing races on error
      }
    },
    [initialRaces, searchParams]
  );

  const filters = {
    fed: searchParams.getAll("fed") as Race["federationSlug"][],
    disc: searchParams.getAll("disc") as Race["discipline"][],
    cat: searchParams.getAll("cat"),
    lat: userLocation?.lat ?? null,
    lng: userLocation?.lng ?? null,
    radius: Number(searchParams.get("radius") ?? 50),
  };

  return (
    <div className="relative w-full h-full">
      <RaceMap
        initialRaces={races}
        filters={filters}
        userLocation={userLocation}
      />

      {/* Floating sidebar */}
      <div className="absolute top-4 left-4 z-10">
        <MapSidebar
          raceCount={races.filter((r) => r.lat && r.lng).length}
          onLocationChange={handleLocationChange}
        />
      </div>
    </div>
  );
}

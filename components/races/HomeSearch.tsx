"use client";

import { useRouter } from "next/navigation";
import { LocationSearch } from "@/components/common/LocationSearch";
import type { GeocodingResult } from "@/types";

export function HomeSearch() {
  const router = useRouter();

  function handleSelect(result: GeocodingResult | null) {
    if (!result) return;
    router.push(
      `/courses?lat=${result.lat}&lng=${result.lng}&radius=50`
    );
  }

  return (
    <div className="max-w-sm">
      <LocationSearch
        onSelect={handleSelect}
        placeholder="Ville ou code postal..."
      />
      <p className="text-xs text-muted-foreground mt-2">
        Trouvez les courses dans un rayon de 50 km
      </p>
    </div>
  );
}

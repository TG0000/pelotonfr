import type { GeocodingResult } from "@/types";

const BAN_BASE = "https://api-adresse.data.gouv.fr";

/**
 * Geocode a French city using the official BAN API (api-adresse.data.gouv.fr).
 * Returns null if the city cannot be found.
 *
 * Use for bulk scraping: add ~200ms delay between calls to be polite.
 * Use for user-facing search: direct calls are fine (user-triggered).
 */
export async function geocodeCity(
  city: string,
  postcode?: string
): Promise<GeocodingResult | null> {
  try {
    const q = encodeURIComponent(city);
    const postcodeParam = postcode ? `&postcode=${encodeURIComponent(postcode)}` : "";
    const url = `${BAN_BASE}/search/?q=${q}${postcodeParam}&type=municipality&limit=1`;

    const res = await fetch(url, {
      headers: { "User-Agent": "PelotonFR/1.0 (contact@pelotonfr.fr)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { label: string; score: number };
      }>;
    };

    const feature = data.features?.[0];
    if (!feature || feature.properties.score < 0.4) return null;

    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, label: feature.properties.label };
  } catch {
    return null;
  }
}

/**
 * Geocode a free-text address (for the user-facing search bar).
 * Returns up to 5 suggestions.
 */
export async function geocodeSearch(
  query: string
): Promise<GeocodingResult[]> {
  if (!query.trim() || query.length < 2) return [];

  try {
    // Municipalities, not street addresses: a rider searching "Flers" wants
    // the town. The default search returns streets too, which is how three
    // indistinguishable "Flers" came back for one query.
    const url =
      `${BAN_BASE}/search/?q=${encodeURIComponent(query)}` +
      `&limit=8&type=municipality`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PelotonFR/1.0 (contact@pelotonfr.fr)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: {
          label: string;
          score: number;
          postcode?: string;
          context?: string;
          city?: string;
        };
      }>;
    };

    return (data.features ?? []).map((f) => {
      // "Flers" alone cannot be chosen between; "Flers (61 · Orne)" can.
      const context = f.properties.context?.split(",").slice(0, 2)
        .map((p) => p.trim()).filter(Boolean).join(" · ");
      return {
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        label: context ? `${f.properties.label} (${context})` : f.properties.label,
      };
    });
  } catch {
    return [];
  }
}

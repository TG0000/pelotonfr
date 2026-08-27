"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Loader2, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GeocodingResult } from "@/types";

interface LocationSearchProps {
  onSelect: (result: GeocodingResult | null) => void;
  placeholder?: string;
  defaultValue?: string;
}

export function LocationSearch({ onSelect, placeholder = "Ville ou code postal...", defaultValue = "" }: LocationSearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);

    if (!value.trim() || value.length < 2) {
      setResults([]);
      setOpen(false);
      if (!value) onSelect(null);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`);
        const data = (await res.json()) as GeocodingResult[];
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(result: GeocodingResult) {
    setQuery(result.label);
    setOpen(false);
    onSelect(result);
  }

  /**
   * "Use my position".
   *
   * The failure was silent: an empty error callback, no pending state. A rider
   * who had once refused the permission clicked and nothing whatever happened,
   * which is indistinguishable from a dead button — and that is exactly how it
   * was reported. Every outcome now says something.
   */
  function handleGeolocate() {
    setGeoError(null);

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError("Votre navigateur ne sait pas donner votre position.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSelect({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Ma position",
        });
        setQuery("Ma position");
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Position refusée. Autorisez la localisation dans votre navigateur, ou tapez une ville."
            : err.code === err.TIMEOUT
              ? "La localisation a été trop longue. Réessayez ou tapez une ville."
              : "Position indisponible. Tapez une ville."
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            className="pl-9"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {/* Rendered unconditionally. Testing `navigator` here made the server
            and the client disagree about whether the button exists at all,
            which is the kind of mismatch that leaves a control inert. */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleGeolocate}
          disabled={locating}
          title="Utiliser ma position"
          aria-label="Utiliser ma position"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Navigation className="size-4" />
          )}
        </Button>
      </div>

      {geoError && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {geoError}
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                onClick={() => handleSelect(r)}
              >
                <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

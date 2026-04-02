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

  function handleGeolocate() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelect({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Ma position" });
        setQuery("Ma position");
      },
      () => {}
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
        {"geolocation" in navigator && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleGeolocate}
            title="Utiliser ma position"
          >
            <Navigation className="size-4" />
          </Button>
        )}
      </div>

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

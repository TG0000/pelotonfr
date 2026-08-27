"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";
import { FEDERATIONS, DISCIPLINES } from "@/lib/constants";
import { categoryLabel } from "@/lib/categories";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function ActiveFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const removeParam = useCallback(
    (key: string, value?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (value !== undefined) {
        // Remove one value from a multi-value param
        const current = params.getAll(key).filter((v) => v !== value);
        params.delete(key);
        current.forEach((v) => params.append(key, v));
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const chips: Array<{ label: string; onRemove: () => void }> = [];

  // Search query
  const q = searchParams.get("q");
  if (q) {
    chips.push({ label: `"${q}"`, onRemove: () => removeParam("q") });
  }

  // Location
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") ?? "50";
  if (lat && lng) {
    const place = searchParams.get("lieu");
    chips.push({
      label: place ? `${place} · ${radius} km` : `Rayon ${radius} km`,
      onRemove: () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("lat");
        params.delete("lng");
        params.delete("radius");
        params.delete("lieu");
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      },
    });
  }

  // Date range
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    let dateLabel = "";
    try {
      if (dateFrom && dateTo) {
        const from = new Date(dateFrom + "T12:00:00Z");
        const to = new Date(dateTo + "T12:00:00Z");
        dateLabel = `${format(from, "d MMM", { locale: fr })} → ${format(to, "d MMM", { locale: fr })}`;
      } else if (dateFrom) {
        const from = new Date(dateFrom + "T12:00:00Z");
        dateLabel = `À partir du ${format(from, "d MMM", { locale: fr })}`;
      } else if (dateTo) {
        const to = new Date(dateTo! + "T12:00:00Z");
        dateLabel = `Jusqu'au ${format(to, "d MMM", { locale: fr })}`;
      }
    } catch {
      dateLabel = "Période";
    }
    chips.push({
      label: dateLabel,
      onRemove: () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("dateFrom");
        params.delete("dateTo");
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      },
    });
  }

  // Federations
  searchParams.getAll("fed").forEach((slug) => {
    const fed = FEDERATIONS.find((f) => f.slug === slug);
    if (fed) {
      chips.push({
        label: fed.name,
        onRemove: () => removeParam("fed", slug),
      });
    }
  });

  // Disciplines
  searchParams.getAll("disc").forEach((val) => {
    const disc = DISCIPLINES.find((d) => d.value === val);
    if (disc) {
      chips.push({
        label: disc.label,
        onRemove: () => removeParam("disc", val),
      });
    }
  });

  // Categories
  searchParams.getAll("cat").forEach((val) => {
    // Labelled through the canonical vocabulary: a chip built from a separate
    // copy of the list silently disappeared whenever the two drifted apart,
    // leaving an active filter the rider could neither see nor remove.
    chips.push({
      label: categoryLabel(val),
      onRemove: () => removeParam("cat", val),
    });
  });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1.5 py-1 font-medium"
        >
          {chip.label}
          <button
            onClick={chip.onRemove}
            className="flex items-center justify-center size-4 rounded-full hover:bg-primary/20 transition-colors"
            aria-label={`Supprimer le filtre ${chip.label}`}
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

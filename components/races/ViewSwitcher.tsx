"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, List, Map } from "lucide-react";
import { cn } from "@/lib/utils";

export type RaceView = "calendrier" | "liste" | "carte";

const VIEWS: Array<{ value: RaceView; label: string; Icon: typeof List }> = [
  { value: "calendrier", label: "Calendrier", Icon: CalendarDays },
  { value: "liste", label: "Liste", Icon: List },
  { value: "carte", label: "Carte", Icon: Map },
];

/**
 * Switches between three readings of one query.
 *
 * The filters, the period included, live in the URL and are untouched here —
 * a map that could not inherit what the rider had already narrowed down was
 * the reason the standalone map page was worth so little on its own.
 */
export function ViewSwitcher({ current }: { current: RaceView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(view: RaceView) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("jour");
    if (view === "calendrier") params.delete("vue");
    else params.set("vue", view);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    /* A plain group rather than a tablist: these buttons navigate, they do
       not reveal panels in the page, and announcing tabs to a screen reader
       promises arrow-key behaviour that does not exist. */
    <div
      role="group"
      aria-label="Affichage"
      className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {VIEWS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-current={value === current ? "true" : undefined}
          onClick={() => select(value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === current
              ? "bg-surface-1 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

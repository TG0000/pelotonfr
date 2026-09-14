"use client";

import { useTransition } from "react";
import { GROUPS } from "@/lib/groups";
import { saveGroups } from "@/app/(main)/club/actions";
import { cn } from "@/lib/utils";

/**
 * Les groupes où je m'aligne, à cocher — plusieurs si besoin.
 *
 * Enregistré au clic, sans bouton : c'est un réglage, pas un formulaire.
 */
export function GroupPicker({ chosen }: { chosen: string[] }) {
  const [pending, start] = useTransition();
  const toggle = (value: string) => {
    const next = chosen.includes(value) ? chosen.filter((g) => g !== value) : [...chosen, value];
    start(() => saveGroups(next));
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Je m&apos;aligne en</span>
      {GROUPS.map((g) => {
        const on = chosen.includes(g.value);
        return (
          <button
            key={g.value}
            type="button"
            disabled={pending}
            onClick={() => toggle(g.value)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-2"
            )}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

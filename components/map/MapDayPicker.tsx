"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fr } from "date-fns/locale";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface DayPickerState {
  /** Le mois affiché, YYYY-MM. */
  month: string;
  /** Le jour choisi, YYYY-MM-DD, ou rien si la carte montre une période. */
  selected: string;
  daysWithRaces: string[];
}

/**
 * Quel jour voir sur la carte.
 *
 * La carte montrait tout le calendrier d'un coup : mille sept cents points,
 * et aucun moyen de répondre à la vraie question — « qu'est-ce qui se court
 * dimanche à moins d'une heure de chez moi ? ». Un jour choisi ici devient la
 * période de la recherche, comme si on l'avait saisie dans les filtres ; les
 * jours où il se court quelque chose sont marqués.
 *
 * Il vit dans le volet de la carte, replié sur une ligne — la carte a besoin
 * de sa largeur — et s'ouvre d'un clic.
 */
export function MapDayPicker({ month, selected, daysWithRaces }: DayPickerState) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const go = (from: string | null, to: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (from) params.set("dateFrom", from);
    else params.delete("dateFrom");
    if (to) params.set("dateTo", to);
    else params.delete("dateTo");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const local = (s: string) => new Date(`${s}T12:00:00`);

  const from = searchParams.get("dateFrom");
  const to = searchParams.get("dateTo");
  const label = selected
    ? format(local(selected), "EEEE d MMMM", { locale: fr })
    : from && to
      ? `${format(local(from), "d MMM", { locale: fr })} → ${format(local(to), "d MMM", { locale: fr })}`
      : from
        ? `à partir du ${format(local(from), "d MMM", { locale: fr })}`
        : "toutes les dates à venir";

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            <span className="text-muted-foreground">Quel jour · </span>
            <span className="font-medium capitalize">{label}</span>
          </span>
          <ChevronDown
            className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={() => go(null, null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2"
            aria-label="Toutes les dates"
            title="Toutes les dates"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="px-2 pb-2">
          <Calendar
            mode="single"
            locale={fr}
            month={local(`${month}-01`)}
            selected={selected ? local(selected) : undefined}
            onSelect={(day) => (day ? go(iso(day), iso(day)) : go(null, null))}
            onMonthChange={(m) => {
              // Le mois entier, jusqu'à ce qu'on y pointe un jour.
              const first = new Date(m.getFullYear(), m.getMonth(), 1);
              const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
              go(iso(first), iso(last));
            }}
            modifiers={{ course: daysWithRaces.map(local) }}
            modifiersClassNames={{
              course:
                "relative font-semibold after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
            className="mx-auto"
          />
          <p className="px-1 text-[11px] text-muted-foreground">
            Un point sous le jour : il s&apos;y court quelque chose.
          </p>
        </div>
      )}
    </div>
  );
}

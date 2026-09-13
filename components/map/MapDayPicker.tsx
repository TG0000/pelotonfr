"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fr } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

/**
 * Quel jour voir sur la carte.
 *
 * La carte montrait tout le calendrier d'un coup : mille sept cents points,
 * et aucun moyen de répondre à la vraie question — « qu'est-ce qui se court
 * dimanche à moins d'une heure de chez moi ? ». Un jour choisi ici devient la
 * période de la recherche, comme si on l'avait saisie dans les filtres ; les
 * jours où il se court quelque chose sont marqués. Changer de mois montre le
 * mois entier, en attendant qu'on y pointe un jour.
 */
export function MapDayPicker({
  month,
  selected,
  daysWithRaces,
}: {
  /** Le mois affiché, YYYY-MM. */
  month: string;
  /** Le jour choisi, YYYY-MM-DD, ou rien si la carte montre une période. */
  selected: string;
  daysWithRaces: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const marked = daysWithRaces.map(local);

  return (
    <aside className="w-full shrink-0 rounded-xl border border-border bg-surface-1 p-2 md:w-72">
      <div className="mb-1 flex items-center justify-between px-2 pt-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-3.5" />
          Quel jour
        </span>
        {(selected || searchParams.has("dateFrom")) && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => go(null, null)}>
            <X className="size-3" />
            Toutes les dates
          </Button>
        )}
      </div>

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
        modifiers={{ course: marked }}
        modifiersClassNames={{
          course: "font-semibold after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary relative",
        }}
        className="w-full"
      />

      <p className="px-2 pb-1 text-[11px] text-muted-foreground">
        {selected
          ? "Un jour : la carte ne montre que ses courses."
          : "Un point sous le jour : il s'y court quelque chose."}
      </p>
    </aside>
  );
}

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DISCIPLINES, FEDERATIONS } from "@/lib/constants";
import type { Race } from "@/types";

interface RaceBadgeProps {
  type: "federation" | "discipline" | "level" | "category";
  value: string;
  className?: string;
}

const FED_STYLES: Record<string, string> = {
  ffc: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  fsgt: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
  ufolep: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

const DISC_STYLES: Record<string, string> = {
  route: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  contre_la_montre: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  course_par_etapes: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cyclosportive: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  vtt: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  cyclocross: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  bmx: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  piste: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
};

export function RaceBadge({ type, value, className }: RaceBadgeProps) {
  if (type === "federation") {
    const fed = FEDERATIONS.find((f) => f.slug === value);
    return (
      <Badge
        variant="outline"
        className={cn("text-xs font-semibold", FED_STYLES[value] ?? "", className)}
      >
        {fed?.name ?? value.toUpperCase()}
      </Badge>
    );
  }

  if (type === "discipline") {
    const disc = DISCIPLINES.find((d) => d.value === value);
    return (
      <Badge
        variant="outline"
        className={cn("text-xs", DISC_STYLES[value] ?? "", className)}
      >
        {disc?.label ?? value}
      </Badge>
    );
  }

  if (type === "level") {
    const labels: Record<string, string> = {
      international: "International",
      national: "National",
      regional: "Régional",
      local: "Local",
    };
    return (
      <Badge variant="secondary" className={cn("text-xs", className)}>
        {labels[value] ?? value}
      </Badge>
    );
  }

  // category
  return (
    <Badge variant="secondary" className={cn("text-xs", className)}>
      {value}
    </Badge>
  );
}

export function FederationDot({ slug }: { slug: string }) {
  const colors: Record<string, string> = {
    ffc: "bg-blue-500",
    fsgt: "bg-green-500",
    ufolep: "bg-orange-500",
  };
  return (
    <span
      className={cn("inline-block size-2 rounded-full", colors[slug] ?? "bg-muted")}
    />
  );
}

export function getRaceDisplayInfo(race: Race) {
  const fed = FEDERATIONS.find((f) => f.slug === race.federationSlug);
  const disc = DISCIPLINES.find((d) => d.value === race.discipline);
  return { fedName: fed?.name ?? race.federationSlug, discLabel: disc?.label ?? race.discipline };
}

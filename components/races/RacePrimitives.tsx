import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

/**
 * The building blocks every race view shares.
 *
 * The old cards gave federation, discipline, level and every category equal
 * visual weight as pills, so the race name — the one thing a rider scans for —
 * was the quietest element on the card. Here the name dominates, the date is a
 * fixed anchor on the left, and everything else recedes to a supporting line.
 */

export const FEDERATION_COLOR: Record<string, string> = {
  ffc: "var(--ffc)",
  fsgt: "var(--fsgt)",
  ufolep: "var(--ufolep)",
};

const FEDERATION_LABEL: Record<string, string> = {
  ffc: "FFC",
  fsgt: "FSGT",
  ufolep: "UFOLEP",
};

const MONTHS_SHORT = [
  "jan", "fév", "mar", "avr", "mai", "juin",
  "juil", "août", "sep", "oct", "nov", "déc",
];

const WEEKDAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/** Parses a stored calendar date without letting the timezone shift it. */
export function parseRaceDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

/**
 * The date as a fixed-width block.
 *
 * A rider scans a list by date first; giving it a constant position and width
 * turns scanning into reading down a column instead of hunting through prose.
 */
export function DateBlock({
  date,
  dateEnd,
  className,
}: {
  date: string;
  dateEnd?: string | null;
  className?: string;
}) {
  const d = parseRaceDate(date);
  const end = dateEnd ? parseRaceDate(dateEnd) : null;
  const multiDay = end != null && end.getTime() > d.getTime();

  return (
    <div
      className={cn(
        "shrink-0 w-12 text-center leading-none select-none",
        className
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS[d.getUTCDay()]}
      </div>
      {/* Measured things wear the mono face: a day number, a placing and a
          time should all look like the same kind of fact. */}
      <div className="mt-1 font-mono text-xl font-medium tabular-nums">
        {d.getUTCDate()}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {MONTHS_SHORT[d.getUTCMonth()]}
      </div>
      {multiDay && (
        <div className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          →&nbsp;{end!.getUTCDate()}&nbsp;{MONTHS_SHORT[end!.getUTCMonth()]}
        </div>
      )}
    </div>
  );
}

/** The federation as a colour, named only where the colour is not enough. */
export function FederationMark({
  slug,
  withLabel = false,
  className,
}: {
  slug: string;
  withLabel?: boolean;
  className?: string;
}) {
  const color = FEDERATION_COLOR[slug] ?? "var(--primary)";
  if (!withLabel) {
    return (
      <span
        className={cn("inline-block size-2 rounded-full shrink-0", className)}
        style={{ background: color }}
        aria-label={FEDERATION_LABEL[slug] ?? slug}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
        className
      )}
      style={{ color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {FEDERATION_LABEL[slug] ?? slug}
    </span>
  );
}

/**
 * Categories, collapsed to what a rider needs to see.
 *
 * A race open to eight categories rendered eight pills, which is noise: the
 * question is only ever "is mine in there". Contiguous runs are folded into a
 * range, and the rest is a count.
 */
export function CategorySummary({
  categories,
  highlight,
  className,
}: {
  categories: string[];
  /** The viewer's own categories, shown in full and marked. */
  highlight?: string[];
  className?: string;
}) {
  if (categories.length === 0) return null;

  const LADDER = [
    "elite", "open1", "open2", "open3",
    "access1", "access2", "access3", "access4",
  ];

  const onLadder = LADDER.filter((c) => categories.includes(c));
  const others = categories.filter((c) => !LADDER.includes(c));

  const parts: string[] = [];
  if (onLadder.length > 0) {
    const first = onLadder[0];
    const last = onLadder[onLadder.length - 1];
    const contiguous =
      LADDER.indexOf(last) - LADDER.indexOf(first) === onLadder.length - 1;
    parts.push(
      onLadder.length === 1
        ? categoryLabel(first)
        : contiguous
          ? `${categoryLabel(first)} → ${categoryLabel(last)}`
          : onLadder.map(categoryLabel).join(", ")
    );
  }
  for (const other of others.slice(0, 3)) parts.push(categoryLabel(other));
  if (others.length > 3) parts.push(`+${others.length - 3}`);

  const mine =
    highlight && categories.some((c) => highlight.includes(c));

  return (
    <span
      className={cn(
        "text-xs truncate",
        mine ? "text-primary font-medium" : "text-muted-foreground",
        className
      )}
    >
      {parts.join(" · ")}
    </span>
  );
}

/** Discipline shown only when it is not the assumed default. */
export function DisciplineTag({
  discipline,
  raceType,
  className,
}: {
  discipline: string;
  raceType?: string | null;
  className?: string;
}) {
  // Road is the overwhelming majority; labelling it adds nothing.
  if (discipline === "route") return null;

  const label =
    raceType && raceType.length <= 22
      ? raceType
      : discipline.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded",
        "bg-surface-3 text-muted-foreground shrink-0",
        className
      )}
    >
      {label}
    </span>
  );
}

/** Distance from the rider's chosen point, when they asked for one. */
export function DistanceTag({ km }: { km?: number | null }) {
  if (km == null) return null;
  return (
    <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-primary">
      {Math.round(km)} km
    </span>
  );
}

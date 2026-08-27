import { cn } from "@/lib/utils";

/**
 * A circuit, with the sector that decides it.
 *
 * French amateur racing is laps of a village loop, and this product exists to
 * tell a rider what that loop will do to them before they start — who is on it,
 * where it climbs, which way the wind crosses it. So the mark is the circuit,
 * traced the way a route is drawn on a map, with one stretch picked out in the
 * yellow of a course arrow: the place the race is won.
 *
 * It replaced a peloton seen from above, which answered a different question —
 * "where am I in this bunch" — from a product that had become about arriving
 * prepared rather than about finding races.
 *
 * Drawn from two paths so it survives a 16px tab icon: at that size it reads as
 * a dark loop with a bright straight, which is enough to recognise.
 */

/** Straights and corners, because a lap has both. A soft blob read as a pebble. */
const CIRCUIT =
  "M 9 5.5 L 24 7.5 L 26 15 L 16.5 16.5 L 21 24 L 8 26 L 5.5 14 Z";

/** The opening straight, where a break goes. */
const SECTOR = "M 9 5.5 L 24 7.5";

export function Logo({
  className,
  tile = true,
}: {
  className?: string;
  /** Off for placements that supply their own background. */
  tile?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      role="img"
      aria-label="PelotonFR"
    >
      {tile && <rect width="32" height="32" rx="7" fill="#18263F" />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={CIRCUIT}
          stroke={tile ? "#7D8DAB" : "currentColor"}
          strokeWidth="3.4"
          opacity={tile ? 1 : 0.45}
        />
        <path d={SECTOR} stroke="#F2C14E" strokeWidth="3.8" />
      </g>
    </svg>
  );
}

/** The mark and the name, locked up. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo className="size-7 shrink-0" />
      <span className="font-heading text-lg font-bold tracking-tight">
        Peloton<span className="text-accent">FR</span>
      </span>
    </span>
  );
}

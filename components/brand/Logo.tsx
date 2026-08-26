import { cn } from "@/lib/utils";

/**
 * The peloton, seen from above.
 *
 * Two ranks of riders and one off the front — the product's own thesis, that
 * you are somewhere in this bunch and the point is to know where. It replaces
 * a stock bicycle icon that a thousand other apps also use, and it is drawn
 * from five capsules so it survives down to a 16px tab icon.
 */
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
      <g transform="translate(16 16) rotate(-18) scale(0.86)">
        <rect x="-11.8" y="-11.1" width="5.6" height="11" rx="2.8" fill="#8C9EBE" />
        <rect x="-11.8" y="0.1" width="5.6" height="11" rx="2.8" fill="#8C9EBE" />
        <rect x="-4.8" y="-11.1" width="5.6" height="11" rx="2.8" fill="#C6D2E6" />
        <rect x="-4.8" y="0.1" width="5.6" height="11" rx="2.8" fill="#C6D2E6" />
        <rect x="3.7" y="-5.5" width="5.6" height="11" rx="2.8" fill="#F2C14E" />
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

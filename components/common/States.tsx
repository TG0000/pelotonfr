import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The states every view shares.
 *
 * Each page used to write its own: "Aucune course trouvée / Essayez de
 * modifier vos filtres" in one place, "Aucune course dans cette zone" in
 * another, a bare "Chargement..." in a third. Same situations, three
 * vocabularies and three layouts.
 *
 * The rule they all follow: say what is not there, then say what to change.
 * An empty state that only reports emptiness leaves the reader to guess
 * whether they broke something.
 */

interface EmptyStateProps {
  icon?: LucideIcon;
  /** What is not there. */
  title: string;
  /** What the reader can do about it. Omit only when there is nothing to do. */
  action?: string;
  /** A control, when the fix is one click rather than a suggestion. */
  children?: React.ReactNode;
  /** Compact fits inside a panel; the default fills a page column. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  action,
  children,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "text-center",
        compact
          ? "px-6 py-12"
          : "rounded-2xl border border-dashed border-border py-20",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "mx-auto text-muted-foreground/40",
            compact ? "mb-3 size-8" : "mb-4 size-10"
          )}
        />
      )}
      <p className={cn("font-medium", compact && "text-sm")}>{title}</p>
      {action && (
        <p className="mt-1 text-sm text-muted-foreground">{action}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

interface ErrorStateProps {
  /** What failed, in the reader's terms. */
  title: string;
  /** What to do now. */
  action?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Something broke.
 *
 * Distinct from empty on purpose: "no races match your filters" and "we could
 * not reach the database" look identical to a reader if both render as an
 * empty list, and only one of them is their fault.
 */
export function ErrorState({
  title,
  action,
  children,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3",
        className
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {action && (
        <p className="mt-0.5 text-sm text-muted-foreground">{action}</p>
      )}
      {children}
    </div>
  );
}

/**
 * Placeholder rows shaped like the content that is coming.
 *
 * A spinner says "wait"; this says "a list of races is arriving", which stops
 * the layout jumping when it does.
 */
export function LoadingRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col divide-y divide-border/60", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Chargement des courses</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3 sm:px-4">
          <div className="w-12 shrink-0 space-y-1.5">
            <div className="mx-auto h-2 w-6 animate-pulse rounded bg-surface-3" />
            <div className="mx-auto h-4 w-7 animate-pulse rounded bg-surface-3" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="h-3.5 animate-pulse rounded bg-surface-3"
              style={{ width: `${58 + ((i * 13) % 30)}%` }}
            />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

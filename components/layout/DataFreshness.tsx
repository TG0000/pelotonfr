import Link from "next/link";
import { getDataFreshness } from "@/lib/db/queries/collectors";
import { cn } from "@/lib/utils";

/**
 * How old the calendar is, said out loud.
 *
 * The collectors once stopped for 73 days and the interface carried on
 * presenting the stale calendar as current. Freshness is part of what this
 * product claims, so it belongs on screen next to the data — not in a workflow
 * log nobody reads.
 */
export async function DataFreshness() {
  let freshness: Awaited<ReturnType<typeof getDataFreshness>>;
  try {
    freshness = await getDataFreshness();
  } catch {
    return null;
  }

  const stale = freshness.verdict === "overdue" || freshness.verdict === "never";

  return (
    <Link
      href="/etat"
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
        stale && "font-medium text-destructive"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          freshness.verdict === "ok" && "bg-fsgt",
          freshness.verdict === "late" && "bg-accent",
          stale && "bg-destructive"
        )}
      />
      {freshness.verdict === "never"
        ? "Aucune collecte enregistrée"
        : `Mis à jour ${freshness.label}`}
    </Link>
  );
}

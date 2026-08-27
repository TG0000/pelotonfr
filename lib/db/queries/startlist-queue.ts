import { toDateOnly } from "@/lib/date";
import { sql } from "../index";

/**
 * The start lists nobody could place, as a work queue.
 *
 * The regional press publishes an engagement list per race, and matching it to
 * a race we hold is a judgement: same day, same commune, compatible categories.
 * Above a threshold we attach it; below, we used to print a line and forget.
 * Kept instead, each unplaced list is a proposition — here is the date, the
 * commune, and the race that came closest — and confirming one is what teaches
 * the scraper the case it could not read.
 */

export interface QueuedMiss {
  id: string;
  sourcePath: string;
  sourceUrl: string;
  raceDate: string | null;
  commune: string | null;
  reason: string;
  bestRaceId: string | null;
  bestRaceName: string | null;
  /** The candidate's own commune — what the operator actually compares. */
  bestRaceCity: string | null;
  bestScore: number | null;
  lastSeenAt: string;
}

/** Why a list could not be placed, said the way it would be said out loud. */
export const MISS_REASONS: Record<string, string> = {
  "no-race-that-day": "Aucune course à cette date au fichier",
  "below-threshold": "Une course existe ce jour-là, le nom ne concorde pas",
  "no-entrants": "Article publié sans liste exploitable",
  "unreadable-slug": "Adresse illisible : ni date ni commune",
};

/**
 * Below this a candidate is coincidence.
 *
 * The matcher applies above 0.62; between the two there is a band where a human
 * can tell at a glance. Under it, offering "c'est cette course" beside a race
 * twenty departments away is not a proposition, it is a trap — the queue says
 * plainly that it has nothing to suggest.
 */
const PLAUSIBLE = 0.35;

/**
 * The commune as the source's address spells it.
 *
 * The path mixes the commune with the race name and the date, and the matcher
 * offers every leading run of words rather than guessing where one ends. What
 * reaches here can therefore trail date residue — "le neubourg 29 et" — which
 * is right for matching and wrong to read.
 */
function tidyCommune(raw: string | null): string | null {
  if (!raw) return null;
  const words = raw.split(" ").filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (/^\d+$/.test(last) || /^(et|du|de|le|la|les)$/.test(last)) words.pop();
    else break;
  }
  return words.join(" ") || null;
}

export async function getStartlistQueue(limit = 60): Promise<QueuedMiss[]> {
  const rows = await sql(
    `SELECT m.id, m.source_path, m.race_date, m.commune, m.miss_reason,
            m.best_race_id, m.best_score, m.last_seen_at,
            r.name AS best_race_name, r.city AS best_race_city
       FROM startlist_misses m
       LEFT JOIN races r ON r.id = m.best_race_id
      WHERE m.resolved_at IS NULL AND m.dismissed_at IS NULL
      -- Actionable first: a list with a plausible candidate is a decision
      -- waiting to be made, the rest is a coverage gap to read.
      ORDER BY (m.best_score >= 0.35) DESC NULLS LAST,
               m.race_date DESC NULLS LAST,
               m.best_score DESC NULLS LAST
      LIMIT $1`,
    [limit]
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const path = r.source_path as string;
    const plausible = r.best_score != null && Number(r.best_score) >= PLAUSIBLE;
    return {
      id: r.id as string,
      sourcePath: path,
      sourceUrl: `https://www.velopressecollection.fr${path}`,
      raceDate: toDateOnly(r.race_date as string | Date | null),
      commune: tidyCommune(r.commune as string | null),
      reason: r.miss_reason as string,
      bestRaceId: plausible ? ((r.best_race_id as string) ?? null) : null,
      bestRaceName: plausible ? ((r.best_race_name as string) ?? null) : null,
      bestRaceCity: plausible ? ((r.best_race_city as string) ?? null) : null,
      bestScore: plausible ? Number(r.best_score) : null,
      lastSeenAt: String(r.last_seen_at),
    };
  });
}

/** How much is waiting, split the way the work itself splits. */
export async function getQueueSummary(): Promise<{
  open: number;
  arbitrable: number;
  resolved: number;
}> {
  const [row] = await sql(
    `SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL AND dismissed_at IS NULL) AS open,
            COUNT(*) FILTER (WHERE resolved_at IS NULL AND dismissed_at IS NULL
                             AND best_score >= 0.35)                              AS arbitrable,
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)                      AS resolved
       FROM startlist_misses`
  );
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    open: Number(r.open ?? 0),
    arbitrable: Number(r.arbitrable ?? 0),
    resolved: Number(r.resolved ?? 0),
  };
}

/**
 * Attaches a list to a race by hand.
 *
 * The scraper reads this before its own matching, so the correction holds for
 * every run afterwards rather than for one night.
 */
export async function resolveMiss(id: string, raceId: string): Promise<void> {
  await sql(
    `UPDATE startlist_misses
        SET resolved_race_id = $2, resolved_at = now(), dismissed_at = NULL
      WHERE id = $1`,
    [id, raceId]
  );
}

/** A list for a race we will never carry. Set aside, not deleted. */
export async function dismissMiss(id: string): Promise<void> {
  await sql(
    `UPDATE startlist_misses SET dismissed_at = now() WHERE id = $1`,
    [id]
  );
}

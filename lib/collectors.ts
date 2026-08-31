/**
 * What the collectors are, and how fresh each one is expected to be.
 *
 * Kept in code rather than in the database so the expectation ships with the
 * scraper it describes: adding a collector without declaring its cadence is a
 * type error, not a silent gap in the watchdog.
 */

export interface CollectorSpec {
  /** Matches the `collector` column written by scripts/lib/track-run.ts. */
  key: string;
  /** How a rider would describe what it brings in. */
  label: string;
  /** Hours after which a successful run is considered overdue. */
  maxAgeHours: number;
  /** A run older than this is a fault worth an email, not just a notice. */
  criticalAgeHours: number;
}

export const COLLECTORS: CollectorSpec[] = [
  { key: "calendar-ffc",    label: "Calendrier FFC",        maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "calendar-fsgt",   label: "Calendrier FSGT",       maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "calendar-ufolep", label: "Calendrier UFOLEP",     maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "ffc-results",     label: "Résultats",             maxAgeHours: 48,  criticalAgeHours: 120 },
  { key: "ffc-history",     label: "Courses récentes",      maxAgeHours: 48,  criticalAgeHours: 120 },
  { key: "ffc-rankings",    label: "Classements nationaux", maxAgeHours: 72,  criticalAgeHours: 240 },
  { key: "engagements",     label: "Listes d'engagés",      maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "categories",      label: "Catégories FSGT/UFOLEP", maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "ffc-briefing",    label: "Fiches organisateur",   maxAgeHours: 48,  criticalAgeHours: 168 },
  { key: "affiches",        label: "Affiches de course",    maxAgeHours: 72,  criticalAgeHours: 240 },
];

export type CollectorVerdict = "ok" | "late" | "overdue" | "never";

export interface CollectorHealth extends CollectorSpec {
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  itemsSeen: number | null;
  itemsWritten: number | null;
  ageHours: number | null;
  verdict: CollectorVerdict;
}

export function verdictFor(
  spec: CollectorSpec,
  ageHours: number | null
): CollectorVerdict {
  if (ageHours === null) return "never";
  if (ageHours > spec.criticalAgeHours) return "overdue";
  if (ageHours > spec.maxAgeHours) return "late";
  return "ok";
}

/** Plain French for how long ago something happened. */
export function describeAge(ageHours: number | null): string {
  if (ageHours === null) return "jamais";
  if (ageHours < 1) return "à l'instant";
  if (ageHours < 24) {
    const h = Math.round(ageHours);
    return `il y a ${h} h`;
  }
  const days = Math.round(ageHours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * Parse a French date string to a JavaScript Date.
 * Supports formats:
 *   - DD/MM/YYYY
 *   - D/M/YYYY
 *   - YYYY-MM-DD (ISO, pass-through)
 *   - "samedi 5 avril 2026" (littéral)
 */

const MONTHS_FR: Record<string, number> = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  // without accent
  fevrier: 2, aout: 8,
};

export function parseFrenchDate(value: string): Date | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\s+/g, " ");

  // ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + "T12:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or D/M/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // "samedi 5 avril 2026" or "5 avril 2026"
  const literalMatch = trimmed
    .toLowerCase()
    .match(/(?:\w+\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (literalMatch) {
    const [, day, monthStr, year] = literalMatch;
    const monthNum = MONTHS_FR[monthStr];
    if (monthNum) {
      const d = new Date(
        `${year}-${String(monthNum).padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00Z`
      );
      return isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

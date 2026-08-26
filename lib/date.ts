/**
 * Date handling for calendar dates.
 *
 * Postgres `date` columns come back from the driver as a Date pinned to local
 * midnight — "2026-08-29" arrives as `Sat Aug 29 2026 00:00:00 GMT+0200`.
 * Calling `toISOString()` on that shifts it to the previous day in any timezone
 * ahead of UTC, so a race on Saturday is announced as Friday.
 *
 * It survives in production only because Vercel runs in UTC; the same code
 * reading the same row on a machine in Paris is a day out. Local components are
 * used instead, which are correct in both.
 */

/** A Postgres date column, however the driver chose to represent it. */
export type DateLike = Date | string | number | null | undefined | unknown;

/** "2026-08-29" — the calendar date, never shifted by the reader's timezone. */
export function toDateOnly(value: DateLike): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // A full timestamp string: keep the date part rather than re-parsing it,
  // which would reintroduce the shift.
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (iso) return iso[1];

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateOnly(parsed);
}

/** Today's calendar date where the process runs, not shifted into UTC. */
export function todayISO(): string {
  return toDateOnly(new Date()) ?? new Date().toISOString().split("T")[0];
}

/** Midday UTC on the given calendar date — safe to format in any timezone. */
export function toSafeDate(value: DateLike): Date | null {
  const iso = toDateOnly(value);
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

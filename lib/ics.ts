/**
 * Une course dans l'agenda du téléphone.
 *
 * Un coureur vit avec son agenda ; une course qui n'y est pas se prend un
 * mariage dessus. Le format iCalendar est le seul que Google Agenda, Apple
 * Calendrier, Outlook et Garmin Connect lisent tous. On écrit des journées
 * entières : l'heure du départ n'est pas toujours connue, et une journée de
 * course est de toute façon prise en entier.
 */

export interface CalendarEvent {
  uid: string;
  title: string;
  /** Jour de la course, YYYY-MM-DD. */
  date: string;
  /** Dernier jour pour une course par étapes, YYYY-MM-DD ; sinon le même. */
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

/** Les virgules, points-virgules et retours à la ligne ont un sens en iCalendar. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (c) => `\\${c}`);
}

/** Une ligne iCalendar ne dépasse pas 75 octets ; la suite est indentée. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

function dateValue(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** Le lendemain, parce qu'en iCalendar la fin d'une journée entière est exclue. */
function dayAfter(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildCalendar(events: CalendarEvent[], name = "PelotonFR"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PelotonFR//Courses//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];

  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@pelotonfr.fr`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue(e.date)}`,
      `DTEND;VALUE=DATE:${dateValue(dayAfter(e.endDate ?? e.date))}`,
      `SUMMARY:${escapeText(e.title)}`
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

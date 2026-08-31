import type { SqlLike } from "@/lib/strava/types";
import { displayRaceName } from "@/lib/race-name";
import { toDateOnly } from "@/lib/date";

/**
 * Le rappel au responsable de club, avant que la porte se ferme.
 *
 * Être prévenu à chaque croix dans un tableur, c'est le tableur avec des
 * e-mails en plus : le responsable reçoit du bruit et finit par l'ignorer. Ce
 * qui manque n'est pas la notification d'un changement, c'est l'échéance —
 * « trois courses ferment demain, sept coureurs à engager ».
 *
 * Écrit ici plutôt que dans le script qui l'appelait, parce qu'il tourne
 * maintenant sur le cron de Vercel : la collecte est chez GitHub, et une alarme
 * installée dans la chose qu'elle surveille s'éteint avec elle.
 */

export interface PendingEntry {
  clubId: string;
  clubName: string;
  officerId: string;
  email: string;
  raceId: string;
  raceName: string;
  city: string | null;
  raceDate: string;
  hoursLeft: number;
  riders: string[];
}

export async function pendingEntries(
  sql: SqlLike,
  withinHours: number
): Promise<PendingEntry[]> {
  const rows = await sql(
    `SELECT m.club_id, c.name AS club_name, u.id AS officer_id, u.email,
            r.id AS race_id, r.name AS race_name, r.city, r.race_date,
            EXTRACT(EPOCH FROM (r.entries_close_at - now())) / 3600 AS hours_left,
            array_agg(DISTINCT COALESCE(ru.display_name, ri.last_name, ru.email)) AS riders
       FROM club_members m
       JOIN clubs c ON c.id = m.club_id
       JOIN users u ON u.id = m.user_id AND u.email IS NOT NULL
       JOIN club_members rm ON rm.club_id = m.club_id
       JOIN user_favorites f ON f.user_id = rm.user_id AND f.intent = 'programmee'
       JOIN users ru ON ru.id = rm.user_id
       LEFT JOIN riders ri ON ri.id = ru.rider_id
       JOIN races r ON r.id = f.race_id
      WHERE m.role = 'responsable'
        AND r.is_cancelled = false
        AND r.entries_close_at IS NOT NULL
        -- Seulement ce que la fédération a écrit. La règle « 20 h trois jours
        -- avant » est vraie souvent et pas toujours : Domfront ferme à 23 h
        -- l'avant-veille. On ne réveille personne pour une date devinée.
        AND r.entries_close_source = 'fiche'
        AND r.entries_close_at > now()
        AND r.entries_close_at < now() + ($1::int * INTERVAL '1 hour')
        AND NOT EXISTS (
          SELECT 1 FROM club_entries ce
           WHERE ce.club_id = m.club_id AND ce.race_id = r.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM club_reminders cr
           WHERE cr.club_id = m.club_id AND cr.race_id = r.id
             AND cr.user_id = u.id
        )
      GROUP BY m.club_id, c.name, u.id, u.email, r.id, r.name, r.city,
               r.race_date, r.entries_close_at
      ORDER BY r.entries_close_at`,
    [withinHours]
  );

  return rows.map((row) => ({
    clubId: row.club_id as string,
    clubName: row.club_name as string,
    officerId: row.officer_id as string,
    email: row.email as string,
    raceId: row.race_id as string,
    raceName: row.race_name as string,
    city: (row.city as string) ?? null,
    raceDate: toDateOnly(row.race_date as string | Date) ?? "",
    hoursLeft: Number(row.hours_left),
    riders: (row.riders as string[]) ?? [],
  }));
}

/** L'échéance dite comme on la dirait : en heures tant que c'est imminent. */
function untilText(hours: number): string {
  if (hours < 36) return `${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

export function compose(races: PendingEntry[], site: string) {
  const riders = new Set(races.flatMap((r) => r.riders)).size;
  const subject =
    races.length === 1
      ? `${races[0].clubName} — 1 course à engager, ${untilText(races[0].hoursLeft)}`
      : `${races[0].clubName} — ${races.length} courses à engager`;

  const lines = races.map((r) => ({
    title: displayRaceName(r.raceName),
    when: new Date(`${r.raceDate}T12:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    city: r.city,
    closes: untilText(r.hoursLeft),
    riders: r.riders,
    url: `${site}/course/${r.raceId}`,
  }));

  const text = [
    `${races.length} course${races.length > 1 ? "s" : ""} à engager, ${riders} coureur${riders > 1 ? "s" : ""}.`,
    "",
    ...lines.flatMap((l) => [
      l.title,
      `  ${l.when}${l.city ? ` · ${l.city}` : ""} — ferme dans ${l.closes}`,
      `  ${l.riders.join(", ")}`,
      `  ${l.url}`,
      "",
    ]),
    `La file du club : ${site}/club`,
  ].join("\n");

  const html =
    `<div style="font-family:system-ui;font-size:15px;line-height:1.5">` +
    `<p>${races.length} course${races.length > 1 ? "s" : ""} à engager, ` +
    `${riders} coureur${riders > 1 ? "s" : ""}.</p>` +
    lines
      .map(
        (l) =>
          `<p><a href="${l.url}"><b>${escapeHtml(l.title)}</b></a><br>` +
          `${escapeHtml(l.when)}${l.city ? ` · ${escapeHtml(l.city)}` : ""} — ` +
          `<b>ferme dans ${l.closes}</b><br>` +
          `${escapeHtml(l.riders.join(", "))}</p>`
      )
      .join("") +
    `<p><a href="${site}/club">Voir la file du club</a></p></div>`;

  return { subject, html, text };
}

export interface ReminderResult {
  officers: number;
  races: number;
  sent: number;
  dryRun: boolean;
  lines: string[];
}

export async function sendClubReminders(
  sql: SqlLike,
  options: {
    withinHours?: number;
    dryRun?: boolean;
    apiKey?: string;
    from?: string;
    site?: string;
  } = {}
): Promise<ReminderResult> {
  const withinHours = options.withinHours ?? 48;
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const dryRun = options.dryRun || !apiKey;
  const from =
    options.from ?? process.env.ALERT_FROM_EMAIL ?? "PelotonFR <onboarding@resend.dev>";
  const site =
    options.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://pelotonfr.vercel.app";

  const pending = await pendingEntries(sql, withinHours);
  const lines: string[] = [];

  if (pending.length === 0) {
    return { officers: 0, races: 0, sent: 0, dryRun, lines };
  }

  /* Un e-mail par responsable, pas un par course : c'est la différence entre un
     rappel et du harcèlement. */
  const byOfficer = new Map<string, PendingEntry[]>();
  for (const p of pending) {
    const list = byOfficer.get(p.officerId) ?? [];
    list.push(p);
    byOfficer.set(p.officerId, list);
  }

  let sent = 0;
  for (const [officerId, races] of byOfficer) {
    const { subject, html, text } = compose(races, site);
    lines.push(`${races[0].email} — ${subject}`);
    for (const r of races) {
      lines.push(
        `  ${displayRaceName(r.raceName).slice(0, 46)} — ${untilText(r.hoursLeft)} — ${r.riders.join(", ")}`
      );
    }

    if (dryRun) continue;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: races[0].email, subject, html, text }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      lines.push(`  envoi refusé (${res.status})`);
      continue;
    }

    sent++;
    // Marqué seulement après un envoi accepté : un rappel perdu doit repartir.
    await sql(
      `INSERT INTO club_reminders (club_id, race_id, user_id)
       SELECT $1::uuid, UNNEST($2::uuid[]), $3::uuid
       ON CONFLICT DO NOTHING`,
      [races[0].clubId, races.map((r) => r.raceId), officerId]
    );
  }

  return {
    officers: byOfficer.size,
    races: pending.length,
    sent,
    dryRun,
    lines,
  };
}

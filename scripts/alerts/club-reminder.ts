/**
 * Le rappel au responsable de club, avant que la porte se ferme.
 *
 *   npx tsx scripts/alerts/club-reminder.ts [--dry-run] [--hours=48]
 *
 * Être prévenu à chaque croix dans le tableur, c'est le tableur avec des
 * e-mails en plus : le responsable reçoit du bruit et finit par l'ignorer. Ce
 * qui manque n'est pas la notification d'un changement, c'est l'échéance —
 * « trois courses ferment demain 20 h, sept coureurs à engager ».
 *
 * Envoyé une fois par course et par club. Une course déjà marquée engagée n'est
 * jamais rappelée, et une course sans échéance connue non plus : on ne réveille
 * personne pour une date qu'on a devinée.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { displayRaceName } from "../../lib/race-name";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.ALERT_FROM_EMAIL ?? "PelotonFR <onboarding@resend.dev>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pelotonfr.vercel.app";

interface Pending {
  clubId: string;
  clubName: string;
  officerId: string;
  email: string;
  raceId: string;
  raceName: string;
  city: string | null;
  raceDate: string;
  closesAt: string;
  hoursLeft: number;
  riders: string[];
}

async function pendingEntries(withinHours: number): Promise<Pending[]> {
  const rows = await sql(
    `SELECT m.club_id, c.name AS club_name, u.id AS officer_id, u.email,
            r.id AS race_id, r.name AS race_name, r.city, r.race_date,
            r.entries_close_at,
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
        -- Seulement ce que la fédération a écrit : on ne réveille personne à
        -- 7 h du matin pour une échéance qu'on a déduite d'une règle.
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

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      clubId: r.club_id as string,
      clubName: r.club_name as string,
      officerId: r.officer_id as string,
      email: r.email as string,
      raceId: r.race_id as string,
      raceName: r.race_name as string,
      city: (r.city as string) ?? null,
      raceDate: String(r.race_date).slice(0, 10),
      closesAt: String(r.entries_close_at),
      hoursLeft: Number(r.hours_left),
      riders: (r.riders as string[]) ?? [],
    };
  });
}

function compose(clubName: string, races: Pending[]) {
  const total = new Set(races.flatMap((r) => r.riders)).size;
  const subject =
    races.length === 1
      ? `${clubName} — 1 course à engager avant ${hourOf(races[0].closesAt)}`
      : `${clubName} — ${races.length} courses à engager`;

  const lines = races.map((r) => {
    const when = new Date(`${r.raceDate}T12:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return {
      title: displayRaceName(r.raceName),
      when,
      city: r.city,
      closes: `${Math.round(r.hoursLeft)} h`,
      riders: r.riders,
      url: `${SITE}/course/${r.raceId}`,
    };
  });

  const text = [
    `${races.length} course${races.length > 1 ? "s" : ""} à engager, ${total} coureur${total > 1 ? "s" : ""}.`,
    "",
    ...lines.flatMap((l) => [
      `${l.title}`,
      `  ${l.when}${l.city ? ` · ${l.city}` : ""} — ferme dans ${l.closes}`,
      `  ${l.riders.join(", ")}`,
      `  ${l.url}`,
      "",
    ]),
    `La file complète : ${SITE}/club`,
  ].join("\n");

  const html = [
    `<p>${races.length} course${races.length > 1 ? "s" : ""} à engager, ${total} coureur${total > 1 ? "s" : ""}.</p>`,
    ...lines.map(
      (l) =>
        `<p><a href="${l.url}"><b>${l.title}</b></a><br>` +
        `${l.when}${l.city ? ` · ${l.city}` : ""} — <b>ferme dans ${l.closes}</b><br>` +
        `${l.riders.join(", ")}</p>`
    ),
    `<p><a href="${SITE}/club">Voir la file du club</a></p>`,
  ].join("\n");

  return { subject, html, text };
}

function hourOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()} h`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.error(`  envoi refusé (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}

async function main() {
  const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
  const withinHours = hoursArg ? Number(hoursArg.split("=")[1]) : 48;
  const dryRun = process.argv.includes("--dry-run") || !RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.log(
      "RESEND_API_KEY absente — exécution à blanc : rien n'est envoyé ni marqué.\n"
    );
  }

  const pending = await pendingEntries(withinHours);
  if (pending.length === 0) {
    console.log("Aucun engagement en attente dans la fenêtre.");
    return;
  }

  // Un e-mail par responsable, pas un par course : c'est la différence entre
  // un rappel et du harcèlement.
  const byOfficer = new Map<string, Pending[]>();
  for (const p of pending) {
    const list = byOfficer.get(p.officerId) ?? [];
    list.push(p);
    byOfficer.set(p.officerId, list);
  }

  for (const [officerId, races] of byOfficer) {
    const { subject, html, text } = compose(races[0].clubName, races);
    console.log(`${races[0].email} — ${subject}`);
    for (const r of races) {
      console.log(
        `  ${displayRaceName(r.raceName).slice(0, 44).padEnd(46)} ${Math.round(r.hoursLeft)} h  ${r.riders.join(", ")}`
      );
    }

    if (dryRun) continue;

    if (await send(races[0].email, subject, html, text)) {
      await sql(
        `INSERT INTO club_reminders (club_id, race_id, user_id)
         SELECT $1::uuid, UNNEST($2::uuid[]), $3::uuid
         ON CONFLICT DO NOTHING`,
        [races[0].clubId, races.map((r) => r.raceId), officerId]
      );
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

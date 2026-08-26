/**
 * Nightly alert digest.
 *
 *   npx tsx scripts/alerts/send-digest.ts [--dry-run]
 *
 * Every active rule is matched against the calendar and the races it has not
 * already announced are sent as one email. Matching reuses the same predicates
 * as the site's own listing, so an alert can never surface a race the site would
 * not show.
 *
 * Delivery is recorded per (rule, race): the job runs every night, but a rider
 * hears about a race once. That table is also what makes the job safe to re-run
 * after a failure — nothing is sent twice.
 *
 * Sending needs RESEND_API_KEY. Without it the job still runs and reports what
 * it would have sent, which is what makes it testable before an account exists.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { toDateOnly } from "../../lib/date";
import { displayRaceName } from "../../lib/race-name";

loadEnv();
const DATABASE_URL = requireEnv("DATABASE_URL");
const sql = createSql(DATABASE_URL);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
/**
 * Resend refuses any sender on an unverified domain. Its shared test address
 * works immediately but only delivers to the account owner, so it is the
 * default until pelotonfr.fr is verified — at which point setting
 * ALERT_FROM_EMAIL switches sending over with no code change.
 */
const FROM = process.env.ALERT_FROM_EMAIL ?? "PelotonFR <onboarding@resend.dev>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pelotonfr.vercel.app";

const FEDERATION_LABEL: Record<string, string> = {
  ffc: "FFC",
  fsgt: "FSGT",
  ufolep: "UFOLEP",
};

interface Rule {
  id: string;
  label: string | null;
  email: string;
  display_name: string | null;
  lead_time_days: number;
}

interface Match {
  race_id: string;
  name: string;
  race_date: string;
  city: string | null;
  department_code: string | null;
  discipline: string;
  federation_slug: string;
  distance_km: number | null;
}


function formatDate(value: unknown): string {
  const iso = toDateOnly(value) ?? String(value);
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail(rule: Rule, matches: Match[]): { subject: string; html: string; text: string } {
  const count = matches.length;
  const scope = rule.label ? ` — ${rule.label}` : "";
  const subject =
    count === 1
      ? `1 nouvelle course${scope}`
      : `${count} nouvelles courses${scope}`;

  const rows = matches
    .map((m) => {
      const place = [m.city, m.department_code ? `(${m.department_code})` : null]
        .filter(Boolean)
        .join(" ");
      const distance =
        m.distance_km != null ? ` · ${Math.round(m.distance_km)} km` : "";
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#6b7280;text-transform:capitalize;">
            ${escapeHtml(formatDate(m.race_date))}
          </div>
          <a href="${SITE_URL}/course/${m.race_id}"
             style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">
            ${escapeHtml(displayRaceName(m.name))}
          </a>
          <div style="font-size:13px;color:#4b5563;margin-top:2px;">
            ${escapeHtml(place)}${distance} ·
            ${escapeHtml(FEDERATION_LABEL[m.federation_slug] ?? m.federation_slug)}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px;">PelotonFR</p>
    <h1 style="font-size:20px;margin:0 0 4px;color:#111827;">${escapeHtml(subject)}</h1>
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">
      Dans les ${rule.lead_time_days} prochains jours.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="font-size:12px;color:#9ca3af;margin-top:28px;">
      <a href="${SITE_URL}/alertes" style="color:#6b7280;">Gérer mes alertes</a>
    </p>
  </div>
</body></html>`;

  const text = [
    subject,
    "",
    ...matches.map((m) => {
      const place = [m.city, m.department_code ? `(${m.department_code})` : null]
        .filter(Boolean)
        .join(" ");
      const distance = m.distance_km != null ? ` · ${Math.round(m.distance_km)} km` : "";
      return `${formatDate(m.race_date)} — ${displayRaceName(m.name)}\n  ${place}${distance}\n  ${SITE_URL}/course/${m.race_id}`;
    }),
    "",
    `Gérer mes alertes : ${SITE_URL}/alertes`,
  ].join("\n");

  return { subject, html, text };
}

async function send(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<boolean> {
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
  const dryRun = process.argv.includes("--dry-run") || !RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.log(
      "RESEND_API_KEY absente — exécution à blanc : les correspondances sont " +
        "calculées et affichées, rien n'est envoyé ni marqué comme livré.\n"
    );
  }

  const rules = (await sql(
    `SELECT r.id, r.label, r.lead_time_days, u.email, u.display_name
       FROM alert_rules r
       JOIN users u ON u.id = r.user_id
      WHERE r.is_active AND u.email IS NOT NULL`
  )) as unknown as Rule[];

  if (rules.length === 0) {
    console.log("Aucune alerte active.");
    return;
  }

  console.log(`${rules.length} alerte(s) active(s).\n`);

  let sent = 0;
  let races = 0;
  let quiet = 0;

  for (const rule of rules) {
    const matches = (await sql(
      `WITH rule AS (SELECT * FROM alert_rules WHERE id = $1::uuid)
       SELECT ra.id AS race_id, ra.name, ra.race_date, ra.city,
              ra.department_code, ra.discipline, f.slug AS federation_slug,
              CASE WHEN rule.center IS NULL OR ra.location IS NULL THEN NULL
                   ELSE ST_Distance(ra.location, rule.center) / 1000 END AS distance_km
         FROM races ra
         JOIN federations f ON f.id = ra.federation_id
         JOIN rule ON true
        WHERE ra.is_active
          AND NOT ra.is_cancelled
          AND ra.race_date >= CURRENT_DATE
          AND ra.race_date <= CURRENT_DATE + (rule.lead_time_days * INTERVAL '1 day')
          AND (rule.federations = '{}' OR f.slug = ANY(rule.federations))
          AND (rule.disciplines = '{}' OR ra.discipline = ANY(rule.disciplines))
          AND (rule.categories = '{}' OR ra.categories && rule.categories)
          AND (rule.center IS NULL
               OR (ra.location IS NOT NULL
                   AND ST_DWithin(ra.location, rule.center, rule.radius_km * 1000)))
          AND NOT EXISTS (SELECT 1 FROM alert_deliveries d
                           WHERE d.rule_id = rule.id AND d.race_id = ra.id)
        ORDER BY ra.race_date, distance_km NULLS LAST
        LIMIT 40`,
      [rule.id]
    )) as unknown as Match[];

    if (matches.length === 0) {
      quiet++;
      continue;
    }

    const { subject, html, text } = renderEmail(rule, matches);
    console.log(
      `  ${rule.email.padEnd(30)} ${String(matches.length).padStart(2)} course(s) — ${subject}`
    );
    for (const m of matches.slice(0, 3)) {
      console.log(`      ${formatDate(m.race_date)} — ${m.name.slice(0, 52)}`);
    }

    if (dryRun) continue;

    const ok = await send(rule.email, subject, html, text);
    if (!ok) continue;

    // Only recorded once the send succeeded, so a provider outage means a retry
    // tomorrow rather than a silently skipped race.
    await sql(
      `INSERT INTO alert_deliveries (rule_id, race_id)
       SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [rule.id, matches.map((m) => m.race_id)]
    );
    await sql(`UPDATE alert_rules SET last_run_at = now() WHERE id = $1::uuid`, [
      rule.id,
    ]);

    sent++;
    races += matches.length;
  }

  console.log(
    dryRun
      ? `\nÀ blanc — ${rules.length - quiet} alerte(s) auraient été envoyées, ${quiet} sans nouveauté.`
      : `\n${sent} email(s) envoyé(s) couvrant ${races} course(s), ${quiet} alerte(s) sans nouveauté.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

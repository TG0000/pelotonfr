import { NextRequest, NextResponse } from "next/server";
import { getCollectorHealth } from "@/lib/db/queries/collectors";
import { describeAge } from "@/lib/collectors";

export const maxDuration = 60;

/**
 * The watchdog.
 *
 * Collection itself runs in GitHub Actions. This runs on Vercel Cron, which is
 * the whole point: when GitHub disabled the scheduled workflow for repository
 * inactivity, the job stopped for 73 days and nothing said so, because the only
 * alarm lived inside the job that had stopped. A watchdog has to be somewhere
 * the thing it watches cannot switch off.
 *
 * It reports rather than collects, and it complains only about collectors that
 * are past the age their own spec allows.
 */

const FROM = process.env.ALERT_FROM_EMAIL ?? "PelotonFR <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

async function notify(subject: string, lines: string[]): Promise<boolean> {
  const to = process.env.WATCHDOG_EMAIL;
  if (!process.env.RESEND_API_KEY || !to) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      text: lines.join("\n"),
      html:
        `<p style="font-family:system-ui;font-size:15px">` +
        lines.map((l) => escapeHtml(l)).join("<br>") +
        `</p>`,
    }),
  });
  return res.ok;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getCollectorHealth();
  const failing = health.filter(
    (h) => h.verdict === "overdue" || h.verdict === "never"
  );
  const late = health.filter((h) => h.verdict === "late");

  let notified = false;
  if (failing.length > 0) {
    notified = await notify(
      `PelotonFR — ${failing.length} collecteur${failing.length > 1 ? "s" : ""} à l'arrêt`,
      [
        "Ces collecteurs n'ont pas produit de données récemment :",
        "",
        ...failing.map(
          (h) =>
            `• ${h.label} — dernière collecte ${describeAge(h.ageHours)}` +
            (h.lastStatus === "failed" && h.lastError
              ? ` (dernière tentative en échec : ${h.lastError.slice(0, 160)})`
              : "")
        ),
        "",
        "Si tous sont concernés, le workflow GitHub est probablement désactivé :",
        "https://github.com/TG0000/pelotonfr/actions/workflows/scrape.yml",
      ]
    );
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    ok: failing.length === 0,
    notified,
    collectors: health.map((h) => ({
      key: h.key,
      label: h.label,
      verdict: h.verdict,
      lastSuccessAt: h.lastSuccessAt,
      ageHours: h.ageHours === null ? null : Math.round(h.ageHours),
      itemsSeen: h.itemsSeen,
      itemsWritten: h.itemsWritten,
    })),
    late: late.map((h) => h.key),
  });
}

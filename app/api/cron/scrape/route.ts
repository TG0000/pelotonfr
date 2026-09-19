import { sendMail } from "@/lib/mail";
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
  if (!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) || !to) return false;
  try {
    await sendMail({
      to,
      subject,
      from: FROM,
      text: lines.join("\n"),
      html:
        `<p style="font-family:system-ui;font-size:15px">` +
        lines.map((l) => escapeHtml(l)).join("<br>") +
        `</p>`,
    });
    return true;
  } catch {
    return false;
  }
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
  /* Un retrait volontaire — la porte premium fermée, une clé absente — et un
     collecteur qu'on ne lance qu'à la main ne sont pas des pannes : réveiller
     quelqu'un pour eux, c'est lui apprendre à ne plus lire ces courriels. */
  const failing = health.filter(
    (h) => h.verdict === "overdue" || h.verdict === "never"
  );
  const late = health.filter((h) => h.verdict === "late");
  /* L'autre panne, celle qui sort en code zéro : le collecteur tourne, voit
     ce qu'il doit voir, et ne rapporte plus rien depuis une semaine. Les
     guides techniques ont passé quatre passages à trente pages vues et zéro
     gardée sans que rien ne le dise. */
  const barren = health.filter((h) => h.shortfall && h.verdict !== "off");

  let notified = false;
  if (failing.length > 0 || barren.length > 0) {
    const titre = failing.length > 0
      ? `PelotonFR — ${failing.length} collecteur${failing.length > 1 ? "s" : ""} à l'arrêt`
      : `PelotonFR — ${barren.length} collecteur${barren.length > 1 ? "s" : ""} ne rapporte${barren.length > 1 ? "nt" : ""} plus rien`;
    notified = await notify(titre, [
      ...(failing.length > 0
        ? [
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
          ]
        : []),
      ...(barren.length > 0
        ? [
            "Ceux-ci tournent mais ne rapportent plus :",
            "",
            ...barren.map((h) =>
              h.kind === "scan"
                ? `• ${h.label} — ${h.seenWeek} examinés cette semaine, aucun n'a rien donné`
                : `• ${h.label} — ${h.itemsWritten} gardés sur ${h.itemsSeen} vus au dernier passage`
            ),
            "",
          ]
        : []),
      "Si tous sont concernés, le workflow GitHub est probablement désactivé :",
      "https://github.com/TG0000/pelotonfr/actions/workflows/scrape.yml",
    ]);
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    ok: failing.length === 0 && barren.length === 0,
    notified,
    collectors: health.map((h) => ({
      key: h.key,
      label: h.label,
      verdict: h.verdict,
      lastSuccessAt: h.lastSuccessAt,
      ageHours: h.ageHours === null ? null : Math.round(h.ageHours),
      kind: h.kind,
      itemsSeen: h.itemsSeen,
      itemsWritten: h.itemsWritten,
      seenWeek: h.seenWeek,
      writtenWeek: h.writtenWeek,
    })),
    late: late.map((h) => h.key),
    barren: barren.map((h) => h.key),
  });
}

/**
 * Le rappel au responsable de club, lancé à la main.
 *
 *   npx tsx scripts/alerts/club-reminder.ts [--dry-run] [--hours=48]
 *
 * En temps normal il tourne sur le cron de Vercel — /api/cron/club. Ce script
 * existe pour l'essayer avant, et pour rattraper une journée manquée.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { sendClubReminders } from "../../lib/club-reminder";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const hoursArg = process.argv.find((a) => a.startsWith("--hours="));
  const result = await sendClubReminders(sql, {
    withinHours: hoursArg ? Number(hoursArg.split("=")[1]) : 48,
    dryRun: process.argv.includes("--dry-run"),
  });

  if (result.dryRun) {
    console.log("Exécution à blanc : rien n'est envoyé ni marqué.\n");
  }
  for (const line of result.lines) console.log(line);

  console.log(
    result.races === 0
      ? "\nAucun engagement en attente dans la fenêtre."
      : `\n${result.races} course(s) pour ${result.officers} responsable(s), ${result.sent} envoi(s).`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

/**
 * Passe sur les circuits déduits douteux.
 *
 *   npx tsx scripts/db/audit-traces.ts [--apply]
 *
 * Trois signes qu'une boucle reconnue parmi les segments n'est pas celle de
 * la course : le nom de la course relie deux communes (une classique n'a pas
 * de circuit), le centre de la boucle est loin de la commune, ou la longueur
 * de tour annoncée par l'organisateur ne colle pas. Sans --apply on liste ;
 * avec, on retire le tracé et on l'inscrit dans trace_checks.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { isPointToPoint } from "../scrapers/utils/point-to-point";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await sql(
    `SELECT t.race_id, r.name, r.city, r.circuit_m, t.source, t.strava_segment, t.distance_m,
            CASE WHEN r.location IS NULL THEN NULL ELSE round(ST_Distance(t.centre, r.location)) END AS centre_m
       FROM race_traces t JOIN races r ON r.id = t.race_id
      WHERE t.source IN ('segment', 'guide')`
  );
  let flagged = 0;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    /* Deux niveaux : une raison sûre retire le tracé ; un simple soupçon
       (centre à plus de 2 km) le laisse en place mais l'inscrit, pour que la
       console le montre et qu'une sortie de coureur tranche. */
    const sure: string[] = [];
    const doubt: string[] = [];
    const name = String(r.name);
    if (await isPointToPoint(sql, name)) sure.push("le nom relie deux communes : course en ligne, pas de circuit");
    if (r.circuit_m != null) {
      const ratio = Number(r.distance_m) / Number(r.circuit_m);
      if (ratio < 0.85 || ratio > 1.15) sure.push(`tour de ${Math.round(Number(r.distance_m))} m contre ${r.circuit_m} m annoncés`);
    }
    if (r.centre_m != null && Number(r.centre_m) > 2000) doubt.push(`centre de la boucle à ${Math.round(Number(r.centre_m) / 100) / 10} km de la commune`);
    if (sure.length === 0 && doubt.length === 0) continue;
    flagged++;
    const verdict = sure.length > 0 ? "audit" : "douteux";
    const reason = [...sure, ...doubt].join(" ; ");
    console.log(`${verdict === "audit" ? (apply ? "retiré " : "à retirer") : "douteux  "} ${name.slice(0, 48).padEnd(50)} ${reason}`);
    if (!apply) continue;
    const [already] = await sql(`SELECT 1 FROM trace_checks WHERE race_id = $1::uuid AND verdict = $2 AND reason = $3`, [r.race_id, verdict, reason]);
    if (!already) {
      await sql(
        `INSERT INTO trace_checks (race_id, old_source, old_ref, old_distance_m, verdict, reason)
         VALUES ($1::uuid, $2, $3, $4::int, $5, $6)`,
        [r.race_id, r.source, String(r.strava_segment ?? ""), Math.round(Number(r.distance_m)), verdict, reason]
      );
    }
    if (verdict === "audit") await sql(`DELETE FROM race_traces WHERE race_id = $1::uuid`, [r.race_id]);
  }
  console.log(`\n${flagged} tracé(s) douteux sur ${rows.length}${apply ? ", retirés" : " (relance avec --apply pour retirer)"}.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

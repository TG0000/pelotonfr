/**
 * Puts a circuit on a race by hand, from a Strava segment.
 *
 *   npx tsx scripts/db/deposit-circuit.ts <course> <segment>
 *
 * `course` is a race id or enough of its name to be unambiguous; `segment` is a
 * Strava segment id or the URL of one. Where the automatic search finds nothing
 * — a point-to-point race, a village nobody has traced — a rider who knows the
 * loop can say so once and it stands for everyone.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { getAccessToken } from "../../lib/db/queries/strava";
import { depositSegmentCircuit } from "../../lib/circuit-deposit";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveRace(needle: string): Promise<{ id: string; name: string }> {
  if (UUID.test(needle)) {
    const [row] = await sql(`SELECT id, name FROM races WHERE id = $1::uuid`, [needle]);
    if (!row) throw new Error(`Aucune course avec l'identifiant ${needle}.`);
    return row as { id: string; name: string };
  }

  const rows = await sql(
    `SELECT id, name, race_date FROM races
      WHERE (name ILIKE $1 OR city ILIKE $1) AND race_date >= CURRENT_DATE - 30
      ORDER BY race_date LIMIT 6`,
    [`%${needle}%`]
  );
  if (rows.length === 0) throw new Error(`Aucune course ne correspond à « ${needle} ».`);
  if (rows.length > 1) {
    console.error(`« ${needle} » désigne ${rows.length} courses :`);
    for (const r of rows as Array<Record<string, unknown>>) {
      console.error(`  ${r.id}  ${String(r.race_date).slice(0, 10)}  ${r.name}`);
    }
    throw new Error("Précise laquelle, par son identifiant.");
  }
  return rows[0] as { id: string; name: string };
}

async function main() {
  const [needle, segmentArg] = process.argv.slice(2);
  if (!needle || !segmentArg) {
    console.error("usage : deposit-circuit.ts <course> <segment|url>");
    process.exit(1);
  }

  const segmentId = Number(segmentArg.match(/(\d{4,})/)?.[1]);
  if (!segmentId) throw new Error(`« ${segmentArg} » ne contient pas d'identifiant de segment.`);

  const race = await resolveRace(needle);

  const [conn] = await sql(
    `SELECT user_id FROM strava_connections ORDER BY updated_at DESC LIMIT 1`
  );
  if (!conn) throw new Error("Aucun compte Strava connecté.");
  const token = await getAccessToken((conn as { user_id: string }).user_id);
  if (!token) throw new Error("Le jeton Strava n'a pas pu être rafraîchi.");

  const out = await depositSegmentCircuit(sql, token, race.id, segmentId);

  console.log(`${race.name}`);
  console.log(
    `  « ${out.name} » — ${(out.lengthM / 1000).toFixed(1)} km, ` +
      `${out.gainM} m de dénivelé, ${out.points} points.`
  );
  console.log(
    out.centreM > 2_500
      ? `  Attention : centré à ${Math.round(out.centreM)} m de la commune. ` +
        `À vérifier — c'est la distance à laquelle la recherche automatique se trompait.`
      : `  Centré à ${Math.round(out.centreM)} m de la commune.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

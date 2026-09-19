/**
 * Le lieu d'une course, contrôlé par ce que dit son nom et son code fédéral.
 *
 *   npx tsx scripts/db/place-check.ts [--dry-run] [--all]
 *
 * Deux sources se contredisent parfois. La fiche fédérale écrit « Vaucluse »
 * ou « Orne » comme lieu, et le géocodeur trouve la commune de Vaucluse
 * (Doubs) ou d'Ornes (Meuse) ; ou elle écrit « Avranches » pour Pont-Hébert.
 * Le nom de la course, lui, commence presque toujours par la commune, et le
 * code de la compétition FFC (C41 42 005 042) porte le département de
 * l'organisateur. Quand le nom donne une commune connue dans ce département,
 * à plus de quinze kilomètres du point actuel, c'est le nom qui a raison.
 * Sans département du tout, le code en fournit un.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { getOrCreateVenueFromCity, normalizePlace } from "../scrapers/utils/venues";
import { townFrom } from "../scrapers/utils/town-from";
import { departmentFromCode } from "../scrapers/utils/ffc-code";
import { trackRun } from "../lib/track-run";
import { isPointToPoint } from "../scrapers/utils/point-to-point";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const dry = process.argv.includes("--dry-run");
  const all = process.argv.includes("--all");
  const rows = (await sql(
    `SELECT id::text, name, city, department_code, source_url,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM races
      WHERE source_url LIKE '%competitions.ffc.fr%'
        AND ($1::boolean OR race_date >= CURRENT_DATE - 30)
      ORDER BY race_date DESC`,
    [all]
  )) as Array<Record<string, unknown>>;

  const cache = new Map<string, string>();
  let moved = 0, departed = 0, checked = 0, unknown = 0;
  for (const r of rows) {
    const town = townFrom(String(r.name));
    const codeDept = departmentFromCode(r.source_url as string | null);
    const dept = (r.department_code as string | null) ?? codeDept;
    if (!town || !dept) {
      // Sans commune lisible : au moins le département, si le code le dit.
      if (!r.department_code && codeDept && !dry) {
        await sql(`UPDATE races SET department_code = $2 WHERE id = $1::uuid AND department_code IS NULL`, [r.id, codeDept]);
        departed++;
      }
      continue;
    }
    checked++;
    // « Jard - Les Herbiers » part de Jard : le nom d'une course en ligne
    // porte deux communes, et la première est déjà la bonne.
    if (await isPointToPoint(sql, String(r.name))) continue;
    const cityNow = String(r.city ?? "");
    const same = cityNow.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "")
      === town.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
    if (same && r.lat != null) continue;

    // A dry run only consults existing venues; it never creates or geocodes one.
    const venueId = dry
      ? ((await sql("SELECT id FROM venues WHERE normalized_city=$1 AND department_code=$2 LIMIT 1", [normalizePlace(town),dept]))[0]?.id as string | undefined)
      : await getOrCreateVenueFromCity(sql, town, { departmentCode: dept }, cache);
    if (!venueId) { unknown++; continue; }
    const [v] = (await sql(
      `SELECT city, department_code, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM venues WHERE id = $1::uuid`,
      [venueId]
    )) as Array<Record<string, unknown>>;
    if (!v || v.lat == null) { unknown++; continue; }
    // Le lieu retenu doit être dans le département attendu, sinon c'est un homonyme.
    if (v.department_code && dept && String(v.department_code) !== dept) { unknown++; continue; }
    const far =
      r.lat == null ||
      Math.hypot((Number(v.lat) - Number(r.lat)) * 111, (Number(v.lng) - Number(r.lng)) * 111 * Math.cos((Number(r.lat) * Math.PI) / 180)) > 15;
    if (!far) continue;
    console.log(`  ${String(r.name).slice(0, 44).padEnd(46)} ${cityNow.padEnd(26)} → ${String(v.city)} (${v.department_code})`);
    if (dry) { moved++; continue; }
    await sql(
      `UPDATE races r
          SET venue_id = v.id, city = v.city, postcode = COALESCE(v.postcode, r.postcode),
              department_code = COALESCE(v.department_code, r.department_code),
              department_name = COALESCE(v.department_name, r.department_name),
              region = COALESCE(v.region, r.region), location = v.location, geocoding_status = 'success'
         FROM venues v WHERE r.id = $1::uuid AND v.id = $2::uuid`,
      [r.id, venueId]
    );
    moved++;
  }
  console.log(`\n${checked} courses contrôlées, ${moved} déplacées sur leur commune, ${departed} départements posés depuis le code, ${unknown} communes inconnues ou hors département.`);
  return { seen: rows.length, written: moved + departed, metadata: { moved, departed, unknown } };
}

if (process.argv.includes("--dry-run")) void main();
else void trackRun(sql, "place-check", main);

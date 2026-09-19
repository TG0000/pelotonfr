/**
 * Placer les courses dont la fédération n'a pas dit la commune.
 *
 *   npx tsx scripts/db/place-from-name.ts [--dry-run]
 *
 * Quatre-vingt-sept courses à venir affichent « Lieu à préciser » — et pour la
 * plupart, le nom commence par la commune : « Coueron (Vélodrome) - Ecole de
 * vélo », « Andreze (U15) ». On lit ce début, on le fait résoudre par la BAN
 * comme n'importe quelle commune, et la course rejoint la carte.
 *
 * Un nom qui commence par un mot de course — Championnat, Trophée, Grand
 * Prix — n'est pas une commune : on n'insiste pas. Une commune que la BAN ne
 * connaît pas non plus reste « à préciser » : mieux vaut un blanc qu'un point
 * posé au hasard.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { getOrCreateVenueFromCity } from "../scrapers/utils/venues";
import { trackRun } from "../lib/track-run";
import { townFrom, townInName } from "../scrapers/utils/town-from";
import { departmentFromCode } from "../scrapers/utils/ffc-code";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const dry = process.argv.includes("--dry-run");
  /* --past : les courses passées aussi. La reprise de l'historique ne connaît
     que le département ; 7 730 courses courues portent « Lieu à préciser »,
     et 6 200 ont leur commune en tête de nom. Sans commune, une édition ne
     retrouve pas la suivante l'année d'après. */
  const past = process.argv.includes("--past");
  /* --dept : les courses dont la « commune » est le nom du département.
     La fiche fédérale écrit « Mayenne » comme lieu de Cossé-le-Vivien, et le
     géocodeur trouve la ville de Mayenne : Craon s'est retrouvé à 45 km, et
     une sortie d'Ambrières s'y est rattachée. Le nom de la course, lui, dit
     la commune. */
  const dept = process.argv.includes("--dept");

  const rows = (await sql(
    dept
      ? `SELECT id::text, name, department_code, city, source_url
           FROM races
          WHERE lower(city) = lower(department_name)
            AND geocoding_status IN ('success', 'approximate')
          ORDER BY race_date DESC`
      : `SELECT id::text, name, department_code, city, source_url
           FROM races
          WHERE city ILIKE '%préciser%'
            AND ($1::boolean OR race_date >= CURRENT_DATE - 30)
          ORDER BY race_date DESC`,
    dept ? [] : [past]
  )) as Array<{ id: string; name: string; department_code: string | null; city: string | null; source_url: string | null }>;

  console.log(dept ? `${rows.length} courses placées sur le nom de leur département.` : `${rows.length} courses « lieu à préciser ».`);

  const cache = new Map<string, string>();
  let placed = 0;
  let noTown = 0;
  let unknown = 0;

  for (const r of rows) {
    /* Le nom commence presque toujours par la commune, mais pas toujours :
       « Cyclo-cross école de vélo Roullours », « GP La Fouillouse féminin »,
       « MOZAC BIKE'S DAY 12 - 20 POUCES ». Quand la tête ne donne rien, on
       cherche la commune n'importe où dans le titre, bornée au département de
       la course : c'est ce qui rend la recherche sûre, on ne compare qu'aux
       communes de ce département-là. */
    const codeDept = departmentFromCode(r.source_url);
    const candidates = [
      townFrom(r.name),
      await townInName(r.name, r.department_code ?? codeDept),
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);
    if (candidates.length === 0) {
      noTown++;
      continue;
    }
    // En mode --dept, si le nom dit la même chose que la fiche (la course a
    // vraiment lieu à Mayenne), il n'y a rien à reprendre.
    if (dept && r.city && candidates.every((t) => t.toLowerCase() === r.city!.toLowerCase())) {
      noTown++;
      continue;
    }
    if (dry) {
      console.log(`  ${candidates.join(" ou ").padEnd(28)} ← ${r.name.slice(0, 60)}`);
      placed++;
      continue;
    }

    /* On essaie la tête d'abord, puis la commune trouvée dans le titre : « ST
       QUENTIN Piste » n'est pas une commune, « Saint-Quentin » si. Avant, le
       premier candidat refusé par la BAN faisait abandonner la course. */
    let venueId: string | null = null;
    let town = candidates[0];
    for (const candidate of candidates) {
      venueId = await getOrCreateVenueFromCity(
        sql,
        candidate,
        { departmentCode: r.department_code ?? codeDept ?? undefined },
        cache
      );
      if (venueId) { town = candidate; break; }
    }
    if (!venueId) {
      unknown++;
      console.log(`  ?  ${candidates.join(" ou ").padEnd(26)} inconnue(s) de la BAN`);
      continue;
    }

    // La même reprise que le collecteur : la commune, le département, le
    // point — depuis le lieu, jamais depuis une supposition.
    await sql(
      `UPDATE races r
          SET venue_id = v.id,
              city = v.city,
              postcode = COALESCE(v.postcode, r.postcode),
              department_code = COALESCE(v.department_code, r.department_code),
              department_name = COALESCE(v.department_name, r.department_name),
              region = COALESCE(v.region, r.region),
              location = COALESCE(v.location, r.location),
              geocoding_status = CASE WHEN v.location IS NOT NULL THEN 'success' ELSE r.geocoding_status END
         FROM venues v
        WHERE r.id = $1::uuid AND v.id = $2::uuid AND v.city IS NOT NULL`,
      [r.id, venueId]
    );
    placed++;
    console.log(`  ✓  ${town.padEnd(26)} ${r.name.slice(0, 50)}`);
  }

  console.log(
    `\n${placed} placées, ${noTown} sans commune lisible dans le nom, ${unknown} inconnues de la BAN.`
  );
  return { seen: rows.length, written: placed, metadata: { noTown, unknown } };
}

trackRun(sql, "place-from-name", main);

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

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const NOT_A_TOWN =
  /^(championnat|chpt|coupe|troph[ée]e|grand prix|gp|prix|tour|ronde|course|crit[ée]rium|souvenir|m[ée]morial|boucles?|circuit|randonn|cyclo|la |le |les |l')/i;

/** Les mots qui ne sont jamais une commune : une catégorie, un mot de course. */
const NOT_TOWN_WORD =
  /^(?:u\d{1,2}|open|access|acc|elite|[ée]lite|pass|cadets?|minimes?|juniors?|seniors?|masters?|dames?|femmes?|hommes?|h\/f|f|h|g|prix|gp|grand|troph[ée]e|challenge|championnat|coupe|souvenir|m[ée]morial|cyclo|cyclocross|cyclo-cross|ccr|xc|xco|bmx|piste|route|clm|contre|omnium|nocturne|semi|gentlemen|tdjc|tdjv|urban|vtt|finale|manche|hiver|amiti[ée]s|halloween|la|le|les|de|du|des|et|\d+.*)$/i;

/**
 * Ce qui précède le premier séparateur, si ça ressemble à une commune.
 *
 * Sans séparateur — « SECONDIGNY U17 », « ANDREZE Open 3 » —, la commune est
 * ce qui reste une fois retirés, par la fin, les mots de catégorie. Le
 * département de la course borne la recherche : « Secondigny » n'est pas
 * ambigu dans les Deux-Sèvres.
 */
function townFrom(name: string): string | null {
  let head = name.split(/\s+[-–(:]|\s+\(|\s{2,}/)[0]?.trim() ?? "";
  if (head === name.trim()) {
    const words = head.split(/\s+/);
    while (words.length > 1 && NOT_TOWN_WORD.test(words[words.length - 1])) words.pop();
    if (words.length > 4) return null;
    head = words.join(" ");
  }
  if (head.length < 3 || head.length > 40) return null;
  if (NOT_A_TOWN.test(head)) return null;
  if (/\d/.test(head) && !/^\w+\s+\d{2}$/.test(head)) return null;
  // « Nieul les Saintes », « St Mars d'Outillé » : des lettres, des espaces,
  // des apostrophes ; pas un titre de course.
  if (!/^[A-Za-zÀ-ÿ' .-]+$/.test(head)) return null;
  return head;
}

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
      ? `SELECT id::text, name, department_code, city
           FROM races
          WHERE lower(city) = lower(department_name)
            AND geocoding_status IN ('success', 'approximate')
          ORDER BY race_date DESC`
      : `SELECT id::text, name, department_code, city
           FROM races
          WHERE city ILIKE '%préciser%'
            AND ($1::boolean OR race_date >= CURRENT_DATE - 30)
          ORDER BY race_date DESC`,
    dept ? [] : [past]
  )) as Array<{ id: string; name: string; department_code: string | null; city: string | null }>;

  console.log(dept ? `${rows.length} courses placées sur le nom de leur département.` : `${rows.length} courses « lieu à préciser ».`);

  const cache = new Map<string, string>();
  let placed = 0;
  let noTown = 0;
  let unknown = 0;

  for (const r of rows) {
    const town = townFrom(r.name);
    if (!town) {
      noTown++;
      continue;
    }
    // En mode --dept, si le nom dit la même chose que la fiche (la course a
    // vraiment lieu à Mayenne), il n'y a rien à reprendre.
    if (dept && r.city && town.toLowerCase() === r.city.toLowerCase()) {
      noTown++;
      continue;
    }
    if (dry) {
      console.log(`  ${town.padEnd(28)} ← ${r.name.slice(0, 60)}`);
      placed++;
      continue;
    }

    const venueId = await getOrCreateVenueFromCity(
      sql,
      town,
      { departmentCode: r.department_code ?? undefined },
      cache
    );
    if (!venueId) {
      unknown++;
      console.log(`  ?  ${town.padEnd(26)} inconnue de la BAN`);
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

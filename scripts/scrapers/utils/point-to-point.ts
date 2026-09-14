import type { SqlLike } from "../../../lib/strava/types";

/**
 * « Paris - Tours », « Bordeaux - Saintes » : deux communes reliées par un
 * tiret, c'est une course en ligne. On ne lui cherche pas de circuit, et une
 * boucle trouvée près du départ n'est pas la sienne.
 *
 * Les deux morceaux doivent être des communes connues de la base (celles où
 * une course a déjà eu lieu), différentes l'une de l'autre. « Louvigné-du-
 * Désert - La Route du Roc » n'en est pas une : le second morceau n'est pas
 * une commune.
 */
export async function isPointToPoint(sql: SqlLike, raceName: string): Promise<boolean> {
  const m = /^\s*([^-–(]{3,40}?)\s*[-–]\s*([^-–(]{3,40}?)\s*(?:[-–(]|$)/.exec(raceName);
  if (!m) return false;
  const cut = (v: string) => v.split(/\s+(?=(?:open|access|elite|élite|u1\d|u2\d|h\/f|hommes|femmes|dames|juniors|cadets|minimes|seniors|masters|pass)\b)/i)[0].trim();
  const a = cut(m[1]);
  const b = cut(m[2]);
  if (!a || !b) return false;
  if (/\d|\b(prix|grand|souvenir|trophée|challenge|championnat|course|circuit|tour|route|boucle|ronde|critérium|criterium)\b/i.test(a + " " + b)) return false;
  if (a.toLowerCase() === b.toLowerCase()) return false;
  // Les deux morceaux sont-ils des communes ? D'abord celles de la base, puis
  // l'annuaire des communes de l'État pour celles où aucune course n'a eu lieu
  // (Tours n'accueille pas de course amateur, mais Paris-Tours y arrive).
  const known = await knownCommunes(sql, a, b);
  if (known === 2) return true;
  const [ga, gb] = await Promise.all([isCommune(a), isCommune(b)]);
  return ga && gb;
}

const communeCache = new Map<string, boolean>();
async function isCommune(name: string): Promise<boolean> {
  const key = name.toLowerCase();
  const cached = communeCache.get(key);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const res = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=nom&limit=3`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()) as Array<{ nom: string }>;
      const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
      ok = list.some((c) => norm(c.nom) === norm(name));
    }
  } catch {
    ok = false;
  }
  communeCache.set(key, ok);
  return ok;
}

async function knownCommunes(sql: SqlLike, a: string, b: string): Promise<number> {
  const rows = await sql(
    `SELECT count(DISTINCT lower(unaccent(city))) AS n FROM races
      WHERE lower(unaccent(city)) IN (lower(unaccent($1)), lower(unaccent($2)))`,
    [a, b]
  ).catch(async () =>
    sql(`SELECT count(DISTINCT lower(city)) AS n FROM races WHERE lower(city) IN (lower($1), lower($2))`, [a, b])
  );
  return Number(rows[0]?.n ?? 0);
}

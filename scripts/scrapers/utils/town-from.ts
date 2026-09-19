/**
 * La commune, lue dans le nom d'une course.
 *
 * « SAINT DENIS DE GASTINES (Open 2.3+Access) », « SECONDIGNY U17 » : la
 * commune est ce qui précède le premier séparateur, ou ce qui reste une
 * fois retirés les mots de catégorie. Partagé entre le placement des
 * courses sans lieu et le contrôle de celles qui en ont un faux.
 */
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
export function townFrom(name: string): string | null {
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


/**
 * La commune cherchée dans tout le titre, bornée à son département.
 *
 * `townFrom` suppose que la commune ouvre le nom, ce qui est vrai la plupart
 * du temps — « AVRANCHES - Elite ». Mais la fédération écrit aussi « Cyclo-
 * cross école de vélo Roullours », « GP La Fouillouse féminin », « MOZAC
 * BIKE'S DAY 12 - 20 POUCES » : la commune est ailleurs, ou collée à un mot
 * de discipline. Ces courses repartaient sans lieu du tout, donc invisibles
 * sur la carte et dans toute recherche par distance.
 *
 * Le département borne la recherche, ce qui la rend sûre : on ne compare
 * qu'aux communes de ce département, et on garde le nom le plus long qui
 * apparaisse en toutes lettres dans le titre, pour que Saint-Denis-de-
 * Gastines l'emporte sur Saint-Denis.
 */
const strip = (v: string) =>
  ` ${v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const communesByDept = new Map<string, string[]>();

async function communesOf(dept: string): Promise<string[]> {
  const cached = communesByDept.get(dept);
  if (cached) return cached;
  let names: string[] = [];
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/departements/${encodeURIComponent(dept)}/communes?fields=nom`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (res.ok) names = ((await res.json()) as Array<{ nom: string }>).map((c) => c.nom);
  } catch {
    names = [];
  }
  communesByDept.set(dept, names);
  return names;
}

export async function townInName(
  name: string,
  departmentCode: string | null
): Promise<string | null> {
  if (!departmentCode) return null;
  const haystack = strip(name);
  let best: string | null = null;
  for (const commune of await communesOf(departmentCode)) {
    /* Trois lettres au moins, et le nom doit apparaître entouré d'espaces :
       « Ger » ne doit pas se reconnaître dans « Gerbéviller ». */
    if (commune.length < 3) continue;
    if (!haystack.includes(strip(commune))) continue;
    if (!best || commune.length > best.length) best = commune;
  }
  return best;
}

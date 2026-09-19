/**
 * Monter, descendre : les règles FFC route, telles que les comités les écrivent.
 *
 * Deux mécaniques distinctes, que les coureurs confondent :
 *
 * 1. La montée en cours de saison (Titre II Route, repris par les comités —
 *    Grand Est 2025, Normandie) : par victoires, ou au barème régional
 *    1er 6 · 2e 4 · 3e 3 · 4e 2 · 5e 1 sur les courses de sa catégorie.
 *    Open 3 → Open 2 : 3 victoires ou 20 points. Open 2 → Open 1 : 4 victoires
 *    ou 30 points. Open 1 → Élite : 3 victoires ou 30 points. Access n → n-1 :
 *    2 victoires dans le niveau, 1 victoire au-dessus, ou 25 points.
 *    Access 1 → Open 3 : 1 victoire en Open, ou 2 victoires en Access 1.
 *
 * 2. La classification de fin de saison, au classement national par points
 *    (CPP, 15 meilleurs résultats du 1er nov. au 31 oct.) : Open 1 au-delà
 *    de 400, Open 2 de 72 à 399, Open 3 de 10 à 71,9, Access 1 sous 10
 *    (hommes ; femmes 100 / 50 / 20). Un Open sans points peut demander
 *    une descente d'une catégorie, entre le 1er novembre et le 31 décembre ;
 *    après une descente, une victoire ou 25 points le font remonter.
 *
 * Les seuils varient d'un comité à l'autre : on cite le Titre II, et on dit
 * au coureur de vérifier chez le sien.
 */

export const LADDER = ["access4", "access3", "access2", "access1", "open3", "open2", "open1", "elite"] as const;
export type Category = (typeof LADDER)[number];

export function isLadderCategory(v: string | null | undefined): v is Category {
  return LADDER.includes(v as Category);
}

/** Barème régional de montée, par place. */
export const RISE_POINTS: Record<number, number> = { 1: 6, 2: 4, 3: 3, 4: 2, 5: 1 };

interface RiseRule {
  wins: number;
  points: number | null;
  /** Une victoire dans une catégorie au-dessus suffit. */
  winAboveCounts: boolean;
}

const RISE: Partial<Record<Category, RiseRule>> = {
  access4: { wins: 2, points: 25, winAboveCounts: true },
  access3: { wins: 2, points: 25, winAboveCounts: true },
  access2: { wins: 2, points: 25, winAboveCounts: true },
  access1: { wins: 2, points: null, winAboveCounts: true },
  open3: { wins: 3, points: 20, winAboveCounts: false },
  open2: { wins: 4, points: 30, winAboveCounts: false },
  open1: { wins: 3, points: 30, winAboveCounts: false },
};

/** Minimum au classement national par points (hommes / femmes). */
const CPP_FLOOR: Record<"men" | "women", Array<{ category: Category; min: number }>> = {
  men: [
    { category: "open1", min: 400 },
    { category: "open2", min: 72 },
    { category: "open3", min: 10 },
  ],
  women: [
    { category: "open1", min: 100 },
    { category: "open2", min: 50 },
    { category: "open3", min: 20 },
  ],
};

export interface SeasonResult {
  rank: number | null;
  raceDate: string;
  raceName: string;
  categories: string[];
  classified: number;
}

export interface Assessment {
  category: Category;
  next: Category | null;
  /** Vers la montée : ce qui compte, ce qui manque. */
  wins: number;
  winsNeeded: number;
  /** Les victoires prises dans une catégorie au-dessus : une suffit en Access. */
  winsAbove: number;
  points: number;
  pointsNeeded: number | null;
  /** Les résultats qui ont marqué au barème. */
  scoring: Array<SeasonResult & { points: number }>;
  raced: number;
  /** Le classement national par points, et le plancher de sa catégorie. */
  cpp: number | null;
  cppRank: number | null;
  cppFloor: number | null;
  /** La catégorie que le CPP justifie à lui seul en fin de saison. */
  cppCategory: Category | null;
  /** Peut demander une descente d'une catégorie, et vers laquelle. */
  down: Category | null;
  downWindow: string;
  verdict: string;
}

/** « d'Open 2 », « d'Access 1 » : l'élision. */
function dLabel(c: Category): string {
  return `d'${catLabel(c)}`;
}

function catLabel(c: Category): string {
  return c.replace(/^access(\d)$/, "Access $1").replace(/^open(\d)$/, "Open $1").replace("elite", "Élite");
}

export function assess(input: {
  category: Category;
  gender: "men" | "women" | null;
  results: SeasonResult[];
  cpp: number | null;
  cppRank: number | null;
}): Assessment {
  const { category, results } = input;
  const idx = LADDER.indexOf(category);
  const next = idx < LADDER.length - 1 ? LADDER[idx + 1] : null;
  const rule = RISE[category];

  /* Deux comptes séparés, parce que la règle les sépare : « 2 victoires dans
     le niveau, 1 victoire au-dessus, ou 25 points ». Tout verser dans le même
     tas faisait qu'une victoire au-dessus, qui suffit à elle seule, comptait
     pour une demie — et le compteur annonçait « 1 victoire sur 2 » à un
     coureur déjà monté. Le barème, lui, ne récompense que les courses de sa
     catégorie. */
  const above = new Set(LADDER.slice(idx + 1));
  let wins = 0;
  let winsAbove = 0;
  let points = 0;
  const scoring: Assessment["scoring"] = [];
  for (const r of results) {
    if (r.rank == null || r.rank > 5) continue;
    const ownLevel = r.categories.includes(category);
    const upper = !ownLevel && r.categories.some((c) => above.has(c as Category));
    if (ownLevel) {
      const p = RISE_POINTS[r.rank] ?? 0;
      if (r.rank === 1) wins++;
      points += p;
      scoring.push({ ...r, points: p });
      continue;
    }
    if (upper && r.rank === 1 && rule?.winAboveCounts) {
      winsAbove++;
      scoring.push({ ...r, points: 0 });
    }
  }

  const floors = input.gender ? CPP_FLOOR[input.gender] : CPP_FLOOR.men;
  const cppFloor = floors.find((f) => f.category === category)?.min ?? null;
  let cppCategory: Category | null = null;
  if (input.cpp != null) {
    cppCategory = "access1";
    for (const f of floors) if (input.cpp >= f.min) { cppCategory = f.category; break; }
  }

  const isOpen = category.startsWith("open");
  const down = idx > 0 && (isOpen ? (input.cpp == null || input.cpp < (cppFloor ?? 0)) : true) ? LADDER[idx - 1] : null;

  let verdict: string;
  if (rule && next) {
    const byAbove = rule.winAboveCounts && winsAbove >= 1;
    const parts: string[] = [];
    parts.push(`${wins} victoire${wins > 1 ? "s" : ""} sur ${rule.wins}`);
    if (rule.points != null) parts.push(`${points} point${points > 1 ? "s" : ""} sur ${rule.points}`);
    const done = wins >= rule.wins || byAbove || (rule.points != null && points >= rule.points);
    const monte = `La montée est automatique, tu as trois jours francs pour changer de licence.`;
    if (byAbove && wins < rule.wins) {
      verdict = `Tu as de quoi monter en ${catLabel(next)} : une victoire au-dessus de ta catégorie suffit, et tu en as ${winsAbove === 1 ? "une" : winsAbove}. ${monte}`;
    } else if (done) {
      verdict = `Tu as de quoi monter en ${catLabel(next)} : ${parts.join(", ")}. ${monte}`;
    } else {
      verdict = `Vers ${catLabel(next)} : ${parts.join(", ")}.`;
      if (rule.winAboveCounts) verdict += ` Une victoire dans une catégorie au-dessus suffirait à elle seule.`;
    }
  } else {
    verdict = "Au sommet de l'échelle : rien à monter.";
  }
  if (isOpen && down && input.cpp != null && cppFloor != null) {
    verdict += ` Au classement national tu as ${input.cpp.toFixed(1).replace(".", ",")} point${input.cpp >= 2 ? "s" : ""}, le plancher ${catLabel(category)} est à ${cppFloor} : tu peux demander une descente en ${catLabel(down)} entre le 1er novembre et le 31 décembre.`;
  }

  return {
    category,
    next,
    wins,
    winsNeeded: rule?.wins ?? 0,
    winsAbove,
    points,
    pointsNeeded: rule?.points ?? null,
    scoring,
    raced: results.length,
    cpp: input.cpp,
    cppRank: input.cppRank,
    cppFloor,
    cppCategory,
    down,
    downWindow: "du 1er novembre au 31 décembre",
    verdict,
  };
}

export { catLabel as ladderLabel };

/** La saison FFC court du 1er novembre au 31 octobre. */
export function seasonBounds(today = new Date()): { from: string; to: string; season: number } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const season = m >= 10 ? y + 1 : y;
  return { from: `${season - 1}-11-01`, to: `${season}-10-31`, season };
}

/**
 * La fenêtre sur laquelle juger la forme d'un coureur.
 *
 * Ce qui intéresse un adversaire, c'est la saison en cours : un palmarès de
 * carrière dit qui on a été, pas qui se présente dimanche. Mais en novembre et
 * en décembre la saison neuve est vide, et n'afficher que zéro victoire serait
 * plus faux encore. Pendant ces deux premiers mois, la fenêtre remonte donc
 * jusqu'à la fin de la saison précédente — août, septembre, octobre — puis se
 * referme sur la seule saison en cours dès le 1er janvier.
 */
export function formWindow(today = new Date()): {
  from: string;
  to: string;
  season: number;
  withPreviousTail: boolean;
} {
  const { from: seasonFrom, season } = seasonBounds(today);
  const twoMonthsIn = new Date(`${seasonFrom}T00:00:00Z`);
  twoMonthsIn.setUTCMonth(twoMonthsIn.getUTCMonth() + 2);
  const withPreviousTail = today < twoMonthsIn;
  if (!withPreviousTail) {
    return { from: seasonFrom, to: today.toISOString().slice(0, 10), season, withPreviousTail };
  }
  const back = new Date(`${seasonFrom}T00:00:00Z`);
  back.setUTCMonth(back.getUTCMonth() - 3);
  return {
    from: back.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
    season,
    withPreviousTail,
  };
}

/** Le courrier de demande de descente, prêt à relire et à signer. */
export function downgradeLetter(input: {
  firstName: string;
  lastName: string;
  uciId: string | null;
  club: string | null;
  a: Assessment;
  season: number;
}): string {
  const { a } = input;
  const who = `${input.firstName} ${input.lastName}`;
  const results = a.scoring.length
    ? a.scoring.map((r) => `${r.raceDate} ${r.raceName} : ${r.rank}e`).join("\n")
    : "aucune place dans les cinq premiers";
  return `${who}
${input.club ? `${input.club}\n` : ""}${input.uciId ? `Licence UCI ${input.uciId}\n` : ""}
À l'attention de la commission route du comité régional

Objet : demande de rétrogradation ${dLabel(a.category)} en ${a.down ? catLabel(a.down) : "la catégorie inférieure"} pour la saison ${input.season + 1}

Madame, Monsieur,

Licencié en ${catLabel(a.category)} cette saison, je sollicite, conformément au Titre II du règlement route, ma rétrogradation en ${a.down ? catLabel(a.down) : "la catégorie inférieure"} pour la saison ${input.season + 1}.

Sur la saison ${input.season}, j'ai pris ${a.raced} départ${a.raced > 1 ? "s" : ""} dans ma catégorie${a.cpp != null ? ` et je figure au classement national par points avec ${a.cpp.toFixed(2).replace(".", ",")} point${a.cpp >= 2 ? "s" : ""}${a.cppRank ? ` (${a.cppRank}e)` : ""}` : ""}${a.cppFloor != null ? `, en dessous du plancher de ${a.cppFloor} points qui correspond à la catégorie ${catLabel(a.category)}` : ""}. Mes places dans les cinq premiers cette saison : ${results}.

Mon niveau actuel ne me permet pas de disputer les épreuves ${catLabel(a.category)} dans des conditions qui aient un sens sportif, ni pour moi ni pour le peloton. Je souhaite retrouver une catégorie où je puisse jouer le résultat, et je sais qu'une victoire ou 25 points me feraient remonter immédiatement.

Je reste à votre disposition pour toute précision, et vous prie d'agréer, Madame, Monsieur, mes salutations sportives.

${who}
`;
}

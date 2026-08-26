/**
 * One canonical category vocabulary.
 *
 * Four sources describe categories, none the same way:
 *   FFC calendar   "Open 2-3-Access 1-2-3-4"
 *   FFC ranking    "Open 2", "U17", "3ème Catégorie"
 *   cyclisme-am.   "OPEN 2,3 + ACCESS 1,2,3,4", "1,2 + JUNIORS", "4,5,6 DAMES"
 *   press          "Access 2", "A3"
 *
 * Storing each verbatim meant "Open3" on a race never matched "Open 3" on a
 * rider, so every category-aware comparison silently returned nothing.
 * Everything is normalised through here instead.
 */

export const CATEGORY_GROUPS = ["ffc", "fsgt", "youth", "women", "other"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export interface CategoryDef {
  value: string;
  label: string;
  group: CategoryGroup;
  /** Youth categories in age order, so a range can be expanded. */
  youthRank?: number;
}

/**
 * The youth ladder. A race written "U7 à U13" covers U9 and U11 as well, so the
 * ranks let a range be expanded rather than storing only its endpoints.
 */
export const YOUTH_LADDER = [
  { value: "u7", label: "U7 (Pré-licencié)", ages: "5-6 ans", rank: 1 },
  { value: "u9", label: "U9 (Poussin)", ages: "7-8 ans", rank: 2 },
  { value: "u11", label: "U11 (Pupille)", ages: "9-10 ans", rank: 3 },
  { value: "u13", label: "U13 (Benjamin)", ages: "11-12 ans", rank: 4 },
  { value: "u15", label: "U15 (Minime)", ages: "13-14 ans", rank: 5 },
  { value: "u17", label: "U17 (Cadet)", ages: "15-16 ans", rank: 6 },
  { value: "u19", label: "U19 (Junior)", ages: "17-18 ans", rank: 7 },
] as const;

export const CATEGORIES: CategoryDef[] = [
  { value: "elite", label: "Élite", group: "ffc" },
  { value: "open1", label: "Open 1", group: "ffc" },
  { value: "open2", label: "Open 2", group: "ffc" },
  { value: "open3", label: "Open 3", group: "ffc" },
  { value: "access1", label: "Access 1", group: "ffc" },
  { value: "access2", label: "Access 2", group: "ffc" },
  { value: "access3", label: "Access 3", group: "ffc" },
  { value: "access4", label: "Access 4", group: "ffc" },

  // The FFC's pre-2021 ladder, still used by its own ranking export.
  { value: "cat1", label: "1ère catégorie", group: "ffc" },
  { value: "cat2", label: "2ème catégorie", group: "ffc" },
  { value: "cat3", label: "3ème catégorie", group: "ffc" },

  { value: "fsgt1", label: "FSGT 1", group: "fsgt" },
  { value: "fsgt2", label: "FSGT 2", group: "fsgt" },
  { value: "fsgt3", label: "FSGT 3", group: "fsgt" },
  { value: "fsgt4", label: "FSGT 4", group: "fsgt" },
  { value: "fsgt5", label: "FSGT 5", group: "fsgt" },
  { value: "fsgt6", label: "FSGT 6", group: "fsgt" },

  ...YOUTH_LADDER.map((y) => ({
    value: y.value,
    label: y.label,
    group: "youth" as const,
    youthRank: y.rank,
  })),
  { value: "baby", label: "Baby vélo (2-4 ans)", group: "youth", youthRank: 0 },
  { value: "ecole", label: "École de cyclisme", group: "youth" },

  { value: "feminines", label: "Féminines", group: "women" },
  { value: "espoirs", label: "Espoirs (U23)", group: "other" },
  { value: "pro", label: "Professionnels", group: "other" },

  // Pass licences: competitive, but outside the club ladder.
  { value: "pass", label: "Pass Cyclisme", group: "other" },

  // Non-racing licences. The federation ranks referees and team staff too, and
  // their labels contain "Elite" or "Pro" — without this they would surface as
  // riders to watch.
  { value: "staff", label: "Encadrement / arbitrage", group: "other" },
];

const BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

export function categoryLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value;
}

function strip(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Every youth value between two ranks, inclusive. */
function youthRange(fromRank: number, toRank: number): string[] {
  const [lo, hi] = fromRank <= toRank ? [fromRank, toRank] : [toRank, fromRank];
  return YOUTH_LADDER.filter((y) => y.rank >= lo && y.rank <= hi).map(
    (y) => y.value
  );
}

const YOUTH_BY_NUMBER = new Map(
  YOUTH_LADDER.map((y) => [Number(y.value.slice(1)), y])
);

/**
 * Turns any source's wording into canonical values.
 *
 * Handles the enumerations the sources actually use — "Open 2,3", "Access
 * 1-2-3-4", "1,2 + Juniors" — and expands youth ranges: "U7 à U13" and
 * "U7-U13" both cover U9 and U11, which writing only the endpoints would lose.
 *
 * `federationSlug` disambiguates bare numbers: "1,2 + Juniors" means FSGT
 * categories on an FSGT race, and nothing at all on an FFC one.
 */
export function normalizeCategories(
  raw: string | null | undefined,
  federationSlug?: string
): string[] {
  if (!raw) return [];
  const text = strip(raw);
  const found = new Set<string>();

  // Youth ranges first: they consume the numbers that follow.
  for (const m of text.matchAll(
    /u\s*(\d{1,2})\s*(?:a|à|-|\/|au)\s*u?\s*(\d{1,2})/g
  )) {
    const from = YOUTH_BY_NUMBER.get(Number(m[1]));
    const to = YOUTH_BY_NUMBER.get(Number(m[2]));
    if (from && to) youthRange(from.rank, to.rank).forEach((v) => found.add(v));
  }

  // Standalone youth mentions.
  for (const m of text.matchAll(/\bu\s*(\d{1,2})\b/g)) {
    const y = YOUTH_BY_NUMBER.get(Number(m[1]));
    if (y) found.add(y.value);
  }

  // Legacy French names, still common in start lists.
  if (/\bjunior/.test(text)) found.add("u19");
  if (/\bcadet/.test(text)) found.add("u17");
  if (/\bminime/.test(text)) found.add("u15");
  if (/\bbenjamin/.test(text)) found.add("u13");
  if (/\bpupille/.test(text)) found.add("u11");
  if (/\bpoussin/.test(text)) found.add("u9");
  if (/\bpre\s*licencie/.test(text)) found.add("u7");
  if (/\bbaby/.test(text)) found.add("baby");
  if (/ecole de cyclisme|ecole cyclisme/.test(text)) found.add("ecole");

  // "Toutes", "Toute catégorie": the race is open to the whole ladder.
  if (/\btoutes?\b|\btoute\s+categorie/.test(text)) {
    if (federationSlug === "fsgt" || federationSlug === "ufolep") {
      for (const n of [1, 2, 3, 4, 5, 6]) found.add(`fsgt${n}`);
    } else {
      for (const v of ["open1", "open2", "open3", "access1", "access2", "access3", "access4"]) {
        found.add(v);
      }
    }
  }

  if (/\bdames?\b|\bfeminin/.test(text)) found.add("feminines");
  // Non-racing licences first: their wording contains "Elite" and "Pro", and
  // reading a referee as an Élite rider would put them in a start-list analysis.
  if (/\barbitre|encadrement|direction|directeur|entraineur|assistant|commissaire|dirigeant/.test(text)) {
    return ["staff"];
  }

  if (/\bpass\b/.test(text)) found.add("pass");
  if (/\bespoir|u23\b/.test(text)) found.add("espoirs");
  if (/\bpro\b|professionnel/.test(text)) found.add("pro");
  if (/\belite?\b/.test(text)) found.add("elite");

  // "Open 2,3" / "Open 1-2-3" / "Open123"
  const openMatch = /open\s*([\d\s,\-/+.]*)/.exec(text);
  if (openMatch) {
    const digits = openMatch[1].match(/[1-3]/g);
    if (digits?.length) digits.forEach((d) => found.add(`open${d}`));
    else ["1", "2", "3"].forEach((d) => found.add(`open${d}`));
  }

  const accessMatch = /access\s*([\d\s,\-/+.]*)/.exec(text);
  if (accessMatch) {
    const digits = accessMatch[1].match(/[1-4]/g);
    if (digits?.length) digits.forEach((d) => found.add(`access${d}`));
    else ["1", "2", "3", "4"].forEach((d) => found.add(`access${d}`));
  }

  // "1ère catégorie", "3eme cat"
  for (const m of text.matchAll(/\b([1-3])\s*(?:ere|er|eme|e)?\s*cat/g)) {
    found.add(`cat${m[1]}`);
  }

  // Bare numbers are FSGT categories — but only on an FSGT race, and only once
  // the FFC wordings above have consumed theirs.
  if (federationSlug === "fsgt" || federationSlug === "ufolep") {
    const withoutFfc = text
      .replace(/open\s*[\d\s,\-/+.]*/g, " ")
      .replace(/access\s*[\d\s,\-/+.]*/g, " ")
      .replace(/u\s*\d{1,2}/g, " ")
      .replace(/\([^)]*\)/g, " ");
    for (const m of withoutFfc.matchAll(/\b([1-6])\b/g)) {
      found.add(`fsgt${m[1]}`);
    }
  }

  return [...found].filter((v) => BY_VALUE.has(v));
}

/**
 * The qualifier some sources append in brackets: "( Critérium nocturne )".
 * Returned separately so it can be stored as the race type rather than mistaken
 * for a category.
 */
export function extractQualifier(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /\(([^)]{2,60})\)/.exec(raw);
  if (!m) return null;
  const inner = m[1].replace(/\s+/g, " ").trim();
  if (/annul/i.test(inner)) return null;
  return inner || null;
}

/** Sources mark a cancelled race inside the category text. */
export function mentionsCancellation(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /\bannul[eé]/i.test(strip(raw)) || /\bannul/i.test(raw);
}

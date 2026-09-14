import { CATEGORY_DEFS } from "@/lib/categories";

/**
 * Les groupes qui courent ensemble.
 *
 * La fédération publie des catégories ; sur la ligne, elles se retrouvent par
 * groupes — les Open avec l'Élite, les Access entre eux, l'échelle FSGT en
 * entier. Un coureur peut s'aligner dans plusieurs : un Open 3 qui descend en
 * Access selon la course, un junior qui court aussi en seniors. C'est ce qu'il
 * coche, et c'est ce que le club regarde pour dire « avec moi ».
 */
export interface RaceGroup {
  value: string;
  label: string;
  categories: string[];
}

export const GROUPS: RaceGroup[] = [
  { value: "open", label: "Élite / Open", categories: ["elite", "open1", "open2", "open3"] },
  { value: "access", label: "Access", categories: ["access1", "access2", "access3", "access4"] },
  { value: "fsgt", label: "FSGT / UFOLEP", categories: ["fsgt1", "fsgt2", "fsgt3", "fsgt4", "fsgt5", "fsgt6"] },
  { value: "jeunes", label: "Jeunes", categories: CATEGORY_DEFS.filter((c) => c.group === "youth").map((c) => c.value) },
  { value: "feminines", label: "Féminines", categories: ["feminines"] },
];

export function isGroup(value: string): boolean {
  return GROUPS.some((g) => g.value === value);
}

/** Le groupe d'une catégorie — celui d'un Open 2 est « open ». */
export function groupOf(category: string | null): string | null {
  if (!category) return null;
  return GROUPS.find((g) => g.categories.includes(category))?.value ?? null;
}

/** Une course admet-elle l'un des groupes ? */
export function raceFitsGroups(raceCategories: string[], groups: string[]): boolean {
  const wanted = new Set(GROUPS.filter((g) => groups.includes(g.value)).flatMap((g) => g.categories));
  return raceCategories.some((c) => wanted.has(c));
}

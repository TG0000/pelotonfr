/**
 * La recherche d'un coureur, retenue d'une visite à l'autre.
 *
 * Elle vit dans un cookie : le serveur peut alors la rejouer avant de rendre
 * la page, sans le clignotement d'un calendrier vide qui se remplit après
 * coup — et sans compte, un cookie suffit. Elle n'est effacée que par un
 * geste : le bouton « Effacer », ou retirer le dernier filtre. Revenir sur
 * une adresse sans paramètres n'est pas un geste, c'est un retour.
 */

export const FILTERS_COOKIE = "pelotonfr.filters";

/** Ce qui décrit une recherche. La page et la vue n'en font pas partie. */
export const REMEMBERED_KEYS = [
  "fed", "disc", "cat", "q",
  "lat", "lng", "radius", "lieu",
  "dateFrom", "dateTo",
] as const;

/** Un an : une saison, et la suivante commence pareil. */
export const FILTERS_MAX_AGE = 60 * 60 * 24 * 365;

export function rememberedFrom(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of REMEMBERED_KEYS) {
    for (const value of params.getAll(key)) kept.append(key, value);
  }
  return kept.toString();
}

/** Côté navigateur seulement : écrit ou efface la recherche retenue. */
export function rememberFilters(serialised: string): void {
  if (typeof document === "undefined") return;
  try {
    if (serialised) localStorage.setItem(FILTERS_COOKIE, serialised);
    else localStorage.removeItem(FILTERS_COOKIE);
  } catch {
    // Sans stockage, le cookie fait le travail.
  }
  document.cookie = serialised
    ? `${FILTERS_COOKIE}=${encodeURIComponent(serialised)}; Max-Age=${FILTERS_MAX_AGE}; Path=/; SameSite=Lax`
    : `${FILTERS_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * L'oubli est un geste — « Effacer », ou retirer la dernière puce — et il doit
 * précéder la navigation : sinon le serveur rejoue la recherche que le
 * coureur vient de retirer.
 */
export function forgetFilters(): void {
  rememberFilters("");
}

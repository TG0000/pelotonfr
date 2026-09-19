/**
 * Une cyclosportive n'est pas une course.
 *
 * La fédération publie « Le Pic de Nore - Randonnée Cyclosportive » dans le
 * même calendrier que les courses, avec la même discipline « route ». Pour un
 * coureur, la différence est entière : pas de catégorie, pas de classement qui
 * compte, pas de dossard à retirer la veille. On la lit dans le nom, sur des
 * mots sans ambiguïté — « montée », « grimpée » ou « défi » sont souvent de
 * vraies courses de côte et restent des courses. Et « randonnée » s'écrit en
 * entier : Randonnai est une commune de l'Orne, et son Grand Prix une course.
 *
 * Une seule définition, lue par le collecteur et par le script de reprise :
 * une copie divergerait la nuit même.
 */
/* « + randonnée pédestre » : beaucoup d'organisateurs adossent une marche à
   leur course et l'écrivent dans le titre. Trois épreuves de Vézot, dont deux
   avec leur feuille de résultats, se retrouvaient classées cyclosportives et
   disparaissaient des filtres route. Ce qui se randonne à pied ne compte pas. */
const NOT_ON_A_BIKE = "(?!\\S*\\s*(?:p[ée]destre|pedestre|[àa] pied|marche))";

export const CYCLO_NAME = new RegExp(
  `cyclosportive|cyclo[- ]?sportive|randonn[ée]${NOT_ON_A_BIKE}|granfondo|gran fondo|\\bbrevet\\b|\\brando\\b`,
  "i"
);

/** Le même motif, dans la syntaxe de Postgres (`~*`). */
export const CYCLO_NAME_SQL =
  `cyclosportive|cyclo[- ]?sportive|randonn[ée]${NOT_ON_A_BIKE}|granfondo|gran fondo|\\mbrevet\\M|\\mrando\\M`;

export function isCyclosportiveName(name: string): boolean {
  return CYCLO_NAME.test(name);
}

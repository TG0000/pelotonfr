/**
 * Une cyclosportive n'est pas une course.
 *
 * La fédération publie « Le Pic de Nore - Randonnée Cyclosportive » dans le
 * même calendrier que les courses, avec la même discipline « route ». Pour un
 * coureur, la différence est entière : pas de catégorie, pas de classement qui
 * compte, pas de dossard à retirer la veille. On la lit dans le nom, sur des
 * mots sans ambiguïté — « montée », « grimpée » ou « défi » sont souvent de
 * vraies courses de côte et restent des courses.
 *
 * Une seule définition, lue par le collecteur et par le script de reprise :
 * une copie divergerait la nuit même.
 */
export const CYCLO_NAME =
  /cyclosportive|cyclo[- ]?sportive|randonn|granfondo|gran fondo|\bbrevet\b|\brando\b/i;

/** Le même motif, dans la syntaxe de Postgres (`~*`). */
export const CYCLO_NAME_SQL =
  "cyclosportive|cyclo[- ]?sportive|randonn|granfondo|gran fondo|\\mbrevet\\M|\\mrando\\M";

export function isCyclosportiveName(name: string): boolean {
  return CYCLO_NAME.test(name);
}

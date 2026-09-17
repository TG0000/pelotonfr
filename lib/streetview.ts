/**
 * Street View, à la place du coureur.
 *
 * Les courses de village passent par des routes que ni Panoramax ni Mapillary
 * n'ont vues ; Google, si. On ne l'analyse pas — ses conditions l'interdisent —
 * on le montre : le panorama suit le curseur le long de la boucle, dans le
 * sens de la course, et une « visite » l'avance toute seule.
 *
 * Le chargement au clic et les plafonds applicatifs limitent les ouvertures.
 * Ils ne mesurent pas tous les événements facturables : quotas, restrictions
 * de clé et suivi de facturation doivent aussi être configurés chez Google.
 */

export interface CoverageSpan {
  fromM: number;
  toM: number;
}

/** Un lien Street View gratuit, sans clé : Google Maps ouvre le panorama. */
export function streetViewLink(lat: number, lng: number, heading: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}&heading=${heading}&pitch=0&fov=90`;
}

/** Cap de la course au point i du tracé, en degrés depuis le nord. */
export function bearingAtIndex(points: Array<[number, number, number, number]>, i: number): number {
  const a = points[Math.max(0, i - 2)];
  const b = points[Math.min(points.length - 1, i + 2)];
  const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  return ((Math.atan2(dLng, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

/** Le point le plus proche d'une distance le long du tracé. */
export function indexAt(points: Array<[number, number, number, number]>, alongM: number): number {
  const i = points.findIndex((p) => p[3] >= alongM);
  return i < 0 ? points.length - 1 : i;
}

function cap(value: string | undefined): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
// Opt in with explicit budgets; no assumed free allowance.
export const DAILY_CAP = cap(process.env.STREETVIEW_DAILY_CAP);
export const MONTHLY_CAP = cap(process.env.STREETVIEW_MONTHLY_CAP);

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
  /* Les deux bornes, pas seulement la basse : appelée avec un indice pris sur
     la course entière alors que le tracé montré est un tour, la borne haute
     laissait passer un point inexistant. */
  const j = Math.min(points.length - 1, Math.max(0, i));
  const a = points[Math.max(0, j - 2)];
  const b = points[Math.min(points.length - 1, j + 2)];
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
/* Les budgets, en panoramas et non en ouvertures : Google facture chaque
   panorama chargé, et la visite en charge un tous les cent cinquante mètres,
   soit une quarantaine sur une boucle de cinq kilomètres. Compter les
   ouvertures sous-estimait la facture d'un facteur quarante.

   Rien ici n'est un plafond de facture : les restrictions de clé, le quota
   posé dans la console Google et le suivi de facturation restent nécessaires. */
export const DAILY_CAP = cap(process.env.STREETVIEW_DAILY_CAP);
export const MONTHLY_CAP = cap(process.env.STREETVIEW_MONTHLY_CAP);

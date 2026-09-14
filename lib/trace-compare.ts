import { metresBetween } from "@/lib/polyline";
import { detectLaps } from "@/lib/trace";

/**
 * Deux tracés de la même course se recouvrent-ils ?
 *
 * La mesure : la part des points de l'un à moins de quarante mètres de
 * l'autre, sur un seul tour chacun. Deux boucles identiques donnent 1 ; une
 * boucle du village voisin, presque 0 ; une boucle qui partage la moitié de
 * ses routes, 0,5 — et c'est là qu'on veut savoir laquelle est la bonne.
 */
export function overlapOf(
  a: Array<[number, number, number, number]>,
  b: Array<[number, number, number, number]>
): number {
  const la = detectLaps(a).lap ?? a;
  const lb = detectLaps(b).lap ?? b;
  if (la.length < 3 || lb.length < 3) return 0;
  let inside = 0;
  for (const p of la) {
    let near = false;
    for (const q of lb) {
      if (Math.abs(p[1] - q[1]) > 0.0006 || Math.abs(p[0] - q[0]) > 0.0009) continue;
      if (metresBetween([p[1], p[0]], [q[1], q[0]]) < 40) { near = true; break; }
    }
    if (near) inside++;
  }
  return inside / la.length;
}

import { decodePolyline, distancesAlong, metresBetween } from "@/lib/polyline";
import { groundAlongLine } from "@/lib/elevation";

/**
 * Du guide technique au tracé.
 *
 * Un guide donne « km 13,5 : Omonville-la-Rogue, Route de la Hague, D45 ».
 * On place chaque point (adresse nationale, en cherchant près du point
 * précédent), on vérifie qu'il est à peu près à la distance annoncée, on
 * relie les points retenus par la route, et on relit le relief. Le résultat
 * n'est pas une sortie enregistrée — c'est une reconstruction, et la page le
 * dit — mais c'est la seule source qui ne dépend ni de Strava ni d'un coureur.
 */

export interface GuidePoint {
  km: number | null;
  place: string;
  road: string | null;
  note: string | null;
}

export interface Placed {
  km: number | null;
  place: string;
  label: string;
  lat: number;
  lng: number;
  score: number;
}

const BAN = "https://api-adresse.data.gouv.fr/search/";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";

async function geocode(q: string, near: { lat: number; lng: number }): Promise<{ lat: number; lng: number; label: string; score: number } | null> {
  const params = new URLSearchParams({ q, lat: near.lat.toFixed(4), lon: near.lng.toFixed(4), limit: "1" });
  try {
    const res = await fetch(`${BAN}?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ geometry: { coordinates: [number, number] }; properties: { label: string; score: number } }> };
    const f = data.features?.[0];
    if (!f) return null;
    return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.label, score: f.properties.score };
  } catch {
    return null;
  }
}

/** Le texte d'un point de passage, débarrassé de ce qui n'est pas un lieu. */
function queryFor(p: GuidePoint): string {
  return `${p.place}${p.road ? ` ${p.road}` : ""}`
    .replace(/\b(vers|direction|entrée|sortie|rond-point|carrefour|lieu-dit|départ|arrivée|réel|fictif)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Place les points de passage, dans l'ordre, en n'acceptant que ceux qui
 * tombent à peu près à la distance annoncée du point précédent retenu.
 */
export async function placeWaypoints(
  points: GuidePoint[],
  start: { lat: number; lng: number }
): Promise<Placed[]> {
  const placed: Placed[] = [];
  let near = start;
  let lastKm: number | null = null;
  for (const p of points) {
    if (!p.place || p.place.length < 3) continue;
    const g = await geocode(queryFor(p), near);
    await new Promise((r) => setTimeout(r, 120)); // la BAN demande la politesse
    if (!g || g.score < 0.4) continue;
    // Une étape ne s'éloigne pas de plus de 80 km de son départ : au-delà,
    // l'adresse nationale a trouvé un homonyme à l'autre bout de la France.
    if (metresBetween([start.lat, start.lng], [g.lat, g.lng]) > 150_000) continue;
    const actual = metresBetween([near.lat, near.lng], [g.lat, g.lng]);
    if (placed.length === 0) {
      // Le premier point d'une étape peut être loin du départ du tour.
    } else if (p.km != null && lastKm != null && p.km > lastKm) {
      const expected = (p.km - lastKm) * 1000;
      // À vol d'oiseau on fait moins que par la route, jamais plus ; et une
      // route qui serpente ne fait pas trois fois la ligne droite.
      if (actual > expected * 1.15 + 800 || (expected > 3000 && actual < expected * 0.3)) continue;
    } else if (actual > 15_000) {
      // Sans kilométrage, on n'accepte pas un saut de plus de quinze kilomètres.
      continue;
    }
    placed.push({ km: p.km, place: p.place, label: g.label, lat: g.lat, lng: g.lng, score: g.score });
    near = { lat: g.lat, lng: g.lng };
    if (p.km != null) lastKm = p.km;
  }
  return placed;
}

/** Relie les points par la route, par paquets, et rend la ligne complète. */
export async function routeThrough(placed: Placed[]): Promise<{ line: Array<[number, number]>; distanceM: number; legsM: number[] } | null> {
  if (placed.length < 2) return null;
  const line: Array<[number, number]> = [];
  let distanceM = 0;
  const legsM: number[] = [];
  const CHUNK = 20;
  for (let i = 0; i < placed.length - 1; i += CHUNK - 1) {
    const part = placed.slice(i, i + CHUNK);
    if (part.length < 2) break;
    const coords = part.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const res = await fetch(`${OSRM}${coords}?overview=full&geometries=polyline&continue_straight=true`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { code: string; routes?: Array<{ distance: number; geometry: string; legs?: Array<{ distance: number }> }> };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) return null;
    for (const leg of route.legs ?? []) legsM.push(leg.distance);
    const pts = decodePolyline(route.geometry);
    for (const p of pts) {
      const last = line[line.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p);
    }
    distanceM += route.distance;
    await new Promise((r) => setTimeout(r, 300));
  }
  return { line, distanceM, legsM };
}

/**
 * Les points qui font faire un détour : une étape routée à 139 % du guide,
 * c'est presque toujours un seul point mal placé. On retire les arrivées de
 * chaque tronçon deux fois plus long que le kilométrage annoncé, et on
 * route à nouveau une fois.
 */
export function dropDetours(placed: Placed[], legsM: number[]): Placed[] {
  const keep = [placed[0]];
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1];
    const b = placed[i];
    const leg = legsM[i - 1];
    const expected = a.km != null && b.km != null && b.km > a.km ? (b.km - a.km) * 1000 : null;
    if (leg != null && expected != null && leg > expected * 1.6 + 1500) continue;
    if (leg != null && expected == null && leg > 25_000) continue;
    keep.push(b);
  }
  return keep;
}

export interface BuiltTrace {
  points: Array<[number, number, number, number]>;
  distanceM: number;
  elevationGainM: number;
  minElevationM: number;
  maxElevationM: number;
  bounds: { west: number; south: number; east: number; north: number };
}

/** Le relief lu sous la ligne, au même pas que partout ailleurs. */
export async function buildTrace(line: Array<[number, number]>, distanceM: number): Promise<BuiltTrace | null> {
  const wanted = Math.min(2_000, Math.max(50, Math.round(distanceM / 25)));
  const ground = await groundAlongLine(line, wanted);
  if (!ground) return null;
  const track = ground.map((g) => [g[0], g[1]] as [number, number]);
  // La ligne est allégée avant la lecture du relief et coupe un peu les
  // virages : la distance de la route est celle du routeur, et les
  // kilomètres le long du profil sont remis à cette échelle.
  const raw = distancesAlong(track);
  const scale = raw[raw.length - 1] > 0 ? distanceM / raw[raw.length - 1] : 1;
  const along = raw.map((d) => d * scale);
  const points = track.map((p, i) => [
    Number(p[1].toFixed(6)), Number(p[0].toFixed(6)), Number(ground[i][2].toFixed(2)), Math.round(along[i]),
  ] as [number, number, number, number]);
  const alts = ground.map((g) => g[2]);
  let gain = 0, ref = alts[0];
  for (const a of alts) { if (a > ref + 2) { gain += a - ref; ref = a; } else if (a < ref) ref = a; }
  const lats = track.map((p) => p[0]); const lngs = track.map((p) => p[1]);
  return {
    points,
    distanceM: Math.round(along[along.length - 1]),
    elevationGainM: Math.round(gain),
    minElevationM: Math.round(Math.min(...alts)),
    maxElevationM: Math.round(Math.max(...alts)),
    bounds: { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) },
  };
}

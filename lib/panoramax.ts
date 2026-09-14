import { metresBetween } from "@/lib/polyline";

/**
 * Panoramax : le Street View libre, tenu par l'IGN et OpenStreetMap France,
 * nourri par des dashcams et des téléphones. Sans clé, sans conditions.
 *
 * On y cherche les photos prises *sur* le tracé — à moins de douze mètres
 * d'un point de la boucle — puis on en garde une tous les quelques
 * centaines de mètres, la plus récente à chaque endroit. C'est ce qu'on
 * montrera, et ce qu'on donnera à lire une fois pour décrire le revêtement.
 */

const API = "https://api.panoramax.xyz/api/search";
const ON_TRACE_M = 20;
const BUCKET_M = 350;

export interface RoadPicture {
  id: string;
  /** Position sur la boucle, en mètres depuis le départ. */
  alongM: number;
  lat: number;
  lng: number;
  takenOn: string;
  /** Image en définition « sd », suffisante pour lire la route. */
  url: string;
  producer: string | null;
}

interface Feature {
  id: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
  assets?: Record<string, { href?: string }>;
}

/** Un morceau de tracé, et la boîte serrée qui l'entoure. */
function chunks(points: Array<[number, number, number, number]>, lengthM = 400, padM = 30) {
  const out: Array<{ bbox: string; from: number; to: number }> = [];
  const dLat = padM / 110_540;
  let i = 0;
  while (i < points.length) {
    const start = points[i][3];
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    let j = i;
    while (j < points.length && points[j][3] - start <= lengthM) {
      const [lng, lat] = points[j];
      if (lng < w) w = lng; if (lng > e) e = lng; if (lat < s) s = lat; if (lat > n) n = lat;
      j++;
    }
    const dLng = padM / (111_320 * Math.cos((s * Math.PI) / 180));
    out.push({ bbox: `${w - dLng},${s - dLat},${e + dLng},${n + dLat}`, from: start, to: points[Math.min(j, points.length) - 1][3] });
    i = Math.max(j, i + 1);
  }
  return out;
}

export async function findRoadPictures(
  points: Array<[number, number, number, number]>,
  max = 8
): Promise<RoadPicture[]> {
  // Une boîte par tronçon plutôt qu'une sur toute la boucle : sur une boîte
  // large, les 500 premières photos rendues sont celles de la nationale
  // voisine, et le circuit n'en reçoit aucune.
  const features: Feature[] = [];
  const seen = new Set<string>();
  for (const c of chunks(points)) {
    const params = new URLSearchParams({ bbox: c.bbox, limit: "200" });
    try {
      const res = await fetch(`${API}?${params}`, { next: { revalidate: 7 * 86_400 } });
      if (!res.ok) continue;
      const data = (await res.json()) as { features?: Feature[] };
      for (const f of data.features ?? []) {
        if (!seen.has(f.id)) { seen.add(f.id); features.push(f); }
      }
    } catch {
      /* un tronçon sans réponse, on continue */
    }
  }
  if (features.length === 0) return [];

  // Chaque photo : son point de tracé le plus proche.
  const candidates: RoadPicture[] = [];
  for (const f of features) {
    if (f.geometry?.type !== "Point") continue;
    const [lng, lat] = f.geometry.coordinates;
    let bestD = ON_TRACE_M;
    let along = -1;
    for (const p of points) {
      if (Math.abs(p[1] - lat) > 0.0003 || Math.abs(p[0] - lng) > 0.0004) continue;
      const d = metresBetween([lat, lng], [p[1], p[0]]);
      if (d < bestD) { bestD = d; along = p[3]; }
    }
    if (along < 0) continue;
    const url = f.assets?.sd?.href ?? f.assets?.hd?.href;
    if (!url) continue;
    candidates.push({
      id: f.id,
      alongM: along,
      lat,
      lng,
      takenOn: String(f.properties.datetime ?? "").slice(0, 10),
      url,
      producer: (f.properties["geovisio:producer"] as string) ?? null,
    });
  }

  // Une par tranche de tracé, la plus récente ; puis les tranches réparties.
  const byBucket = new Map<number, RoadPicture>();
  for (const c of candidates) {
    const b = Math.floor(c.alongM / BUCKET_M);
    const cur = byBucket.get(b);
    if (!cur || c.takenOn > cur.takenOn) byBucket.set(b, c);
  }
  const picked = [...byBucket.values()].sort((a, b) => a.alongM - b.alongM);
  if (picked.length <= max) return picked;
  const step = picked.length / max;
  return Array.from({ length: max }, (_, i) => picked[Math.floor(i * step)]);
}

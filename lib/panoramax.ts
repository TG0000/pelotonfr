import { metresBetween } from "@/lib/polyline";
import { detectLaps } from "@/lib/trace";

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
  /** Cap de la photo (0 = nord), tel que Panoramax le donne. */
  azimuth: number | null;
  /** 360 pour une caméra sphérique, sinon l'angle de champ ou null. */
  fov: number | null;
  /** Sens de la course à cet endroit du tracé, en degrés depuis le nord. */
  bearing: number;
}

/** Cap du tracé autour d'un point, en degrés depuis le nord, sens de la course. */
function bearingAt(points: Array<[number, number, number, number]>, idx: number): number {
  const a = points[Math.max(0, idx - 2)];
  const b = points[Math.min(points.length - 1, idx + 2)];
  const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const deg = (Math.atan2(dLng, b[1] - a[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
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
  track: Array<[number, number, number, number]>,
  max = 8
): Promise<RoadPicture[]> {
  // Une sortie enregistrée fait douze fois le tour : on lit un seul tour, pour
  // que « km 3,4 » veuille dire quelque chose sur la boucle.
  const points = detectLaps(track).lap ?? track;
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
    let idx = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (Math.abs(p[1] - lat) > 0.0003 || Math.abs(p[0] - lng) > 0.0004) continue;
      const d = metresBetween([lat, lng], [p[1], p[0]]);
      if (d < bestD) { bestD = d; along = p[3]; idx = i; }
    }
    if (along < 0) continue;
    const io = f.properties["pers:interior_orientation"] as { field_of_view?: number } | undefined;
    const az = f.properties["view:azimuth"];
    // La voiture doit rouler sur la route de la course, pas la croiser : à
    // vingt mètres d'un carrefour, une photo prise sur la route perpendiculaire
    // montre une haie et rien de la chaussée qu'on cherche. Le cap de la photo
    // et celui du tracé doivent s'accorder, à 35° près, dans un sens ou l'autre.
    const bearing = bearingAt(points, idx);
    if (typeof az === "number") {
      const x = (((az - bearing) % 180) + 180) % 180;
      if (Math.min(x, 180 - x) > 35) continue;
    }
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
      azimuth: typeof az === "number" ? az : null,
      fov: typeof io?.field_of_view === "number" ? io.field_of_view : null,
      bearing: Math.round(bearing),
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

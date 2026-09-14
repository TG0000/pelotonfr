import { metresBetween } from "@/lib/polyline";
import type { RoadPicture } from "@/lib/panoramax";

/**
 * Mapillary, en secours de Panoramax.
 *
 * Même principe, autre couverture : là où personne n'a versé de photo sur
 * Panoramax (Louvigné-du-Désert : une seule), Mapillary en a parfois. Il
 * faut une clé (MAPILLARY_TOKEN, gratuite sur mapillary.com/developer) ;
 * sans elle, cette source se tait.
 */
const API = "https://graph.mapillary.com/images";

interface Img {
  id: string;
  thumb_1024_url?: string;
  computed_geometry?: { coordinates: [number, number] };
  geometry?: { coordinates: [number, number] };
  compass_angle?: number;
  captured_at?: number;
  camera_type?: string;
  sequence?: string;
}

export function mapillaryConfigured(): boolean {
  return Boolean(process.env.MAPILLARY_TOKEN);
}

export async function findMapillaryPictures(
  points: Array<[number, number, number, number]>,
  bounds: { west: number; south: number; east: number; north: number },
  max = 8
): Promise<RoadPicture[]> {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return [];
  const params = new URLSearchParams({
    access_token: token,
    fields: "id,thumb_1024_url,computed_geometry,geometry,compass_angle,captured_at,camera_type,sequence",
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    limit: "500",
  });
  let data: { data?: Img[] };
  try {
    const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return [];
    data = (await res.json()) as { data?: Img[] };
  } catch {
    return [];
  }
  const out: RoadPicture[] = [];
  for (const img of data.data ?? []) {
    const c = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
    if (!c || !img.thumb_1024_url) continue;
    const [lng, lat] = c;
    let bestD = 20, along = -1, idx = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (Math.abs(p[1] - lat) > 0.0003 || Math.abs(p[0] - lng) > 0.0004) continue;
      const d = metresBetween([lat, lng], [p[1], p[0]]);
      if (d < bestD) { bestD = d; along = p[3]; idx = i; }
    }
    if (along < 0) continue;
    const a = points[Math.max(0, idx - 2)], b = points[Math.min(points.length - 1, idx + 2)];
    const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
    const bearing = ((Math.atan2(dLng, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
    const az = typeof img.compass_angle === "number" ? img.compass_angle : null;
    if (az != null) {
      const x = (((az - bearing) % 180) + 180) % 180;
      if (Math.min(x, 180 - x) > 35) continue;
    }
    out.push({
      id: `mly:${img.id}`,
      alongM: along, lat, lng,
      takenOn: img.captured_at ? new Date(img.captured_at).toISOString().slice(0, 10) : "",
      url: img.thumb_1024_url,
      producer: "Mapillary",
      azimuth: az,
      travel: null,
      fov: img.camera_type === "spherical" || img.camera_type === "equirectangular" ? 360 : null,
      bearing: Math.round(bearing),
    });
  }
  const byBucket = new Map<number, RoadPicture>();
  for (const c of out) {
    const k = Math.floor(c.alongM / 350);
    const cur = byBucket.get(k);
    if (!cur || c.takenOn > cur.takenOn) byBucket.set(k, c);
  }
  const picked = [...byBucket.values()].sort((a, b) => a.alongM - b.alongM);
  if (picked.length <= max) return picked;
  const step = picked.length / max;
  return Array.from({ length: max }, (_, i) => picked[Math.floor(i * step)]);
}

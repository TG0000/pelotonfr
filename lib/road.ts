import { metresBetween } from "@/lib/polyline";

/**
 * La route elle-même : sa largeur, sa nature, son statut.
 *
 * Après le relief et le vent, ce que le coureur demande c'est « ça passe à
 * combien de large, et c'est quoi comme route ». La BD TOPO de l'IGN décrit
 * chaque tronçon de France : largeur de chaussée, nombre de voies, nature
 * (route à une chaussée, empierrée, chemin), classement (départementale,
 * communale), zone urbaine. On la lit le long du tracé et on l'additionne
 * en mètres de course.
 *
 * Ce qu'aucune base ne dit : le type d'enrobé, les gravillons, l'état des
 * bas-côtés. Ça, seuls ceux qui ont roulé le savent — d'où le signalement
 * « la route » sur la page, qui complète ce que l'IGN mesure.
 */

const WFS = "https://data.geopf.fr/wfs/ows";

/** Au-delà, un point du tracé n'est pas sur ce tronçon. */
const MATCH_M = 18;

export interface RoadStretch {
  /** « D220 », « rue de la Gare », ou « voie communale ». */
  label: string;
  classement: string | null;
  nature: string;
  widthM: number | null;
  lanes: number | null;
  urban: boolean;
  lengthM: number;
}

export interface RoadReport {
  /** Part du tracé qu'un tronçon IGN a reconnue. */
  coveredShare: number;
  minWidthM: number | null;
  /** Mètres de course sur moins de 4,5 m de chaussée : on ne double pas à trois. */
  narrowM: number;
  /** Mètres de course hors bitume (empierrée, chemin, sentier). */
  unpavedM: number;
  urbanM: number;
  totalM: number;
  /** Les routes empruntées, la plus longue d'abord. */
  stretches: RoadStretch[];
  /** Ce que ça change, en une phrase. */
  verdict: string;
}

export interface Feature {
  geometry: { type: string; coordinates: number[][] };
  properties: Record<string, unknown>;
}

function segDistanceM(p: [number, number], a: number[], b: number[]): number {
  // Planar projection, good enough at 20 m.
  const k = Math.cos((p[1] * Math.PI) / 180);
  const px = (p[0] - a[0]) * k, py = p[1] - a[1];
  const vx = (b[0] - a[0]) * k, vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * vx + py * vy) / l2));
  const q: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return metresBetween([p[1], p[0]], [q[1], q[0]]);
}

function nearest(point: [number, number], features: Feature[]): Feature | null {
  let best: Feature | null = null;
  let bestD = MATCH_M;
  for (const f of features) {
    const c = f.geometry.coordinates;
    if (f.geometry.type !== "LineString" || c.length < 2) continue;
    // Cheap reject on the feature's extent.
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [x, y] of c) {
      if (x < minLng) minLng = x; if (x > maxLng) maxLng = x;
      if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
    }
    const pad = 0.0004;
    if (point[0] < minLng - pad || point[0] > maxLng + pad || point[1] < minLat - pad || point[1] > maxLat + pad) continue;
    for (let i = 1; i < c.length; i++) {
      const d = segDistanceM(point, c[i - 1], c[i]);
      if (d < bestD) { bestD = d; best = f; }
    }
  }
  return best;
}

function labelOf(p: Record<string, unknown>): string {
  const numero = p.cpx_numero as string | null;
  if (numero) return numero;
  const nom = (p.nom_voie_ban_droite ?? p.nom_voie_ban_gauche ?? p.cpx_toponyme_route_nommee) as string | null;
  if (nom) return nom;
  const nature = String(p.nature ?? "");
  if (/empierr/i.test(nature)) return "route empierrée";
  if (/chemin|sentier/i.test(nature)) return nature.toLowerCase();
  return "voie communale";
}

function isUnpaved(nature: string): boolean {
  return /empierr|chemin|sentier|piste/i.test(nature);
}

async function fetchCell(b: {
  west: number; south: number; east: number; north: number;
}): Promise<Feature[]> {
  const pad = 0.001;
  const params = new URLSearchParams({
    SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature",
    TYPENAME: "BDTOPO_V3:troncon_de_route",
    BBOX: `${b.south - pad},${b.west - pad},${b.north + pad},${b.east + pad},urn:ogc:def:crs:EPSG::4326`,
    OUTPUTFORMAT: "application/json",
    COUNT: "3000",
  });
  const res = await fetch(`${WFS}?${params}`, { next: { revalidate: 30 * 86_400 }, signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`IGN a répondu ${res.status}`);
  const data = (await res.json()) as { features?: Feature[] };
  return data.features ?? [];
}

/**
 * Les tronçons sous une emprise, découpée quand elle est large.
 *
 * L'IGN rend au plus trois mille tronçons par requête. Sur une boucle de
 * village c'est large ; sur un tour de cent kilomètres, la réponse est
 * tronquée, et tronquée au hasard : la route sous la moitié du parcours n'y
 * est pas, et le rapport se taisait faute de couverture. On découpe en cases
 * d'environ huit kilomètres, jamais plus de douze, six à la fois.
 */
const CELL_DEG = 0.08;
const MAX_CELLS = 12;

export async function fetchRoadFeatures(bounds: {
  west: number; south: number; east: number; north: number;
}): Promise<Feature[]> {
  const cols = Math.min(MAX_CELLS, Math.max(1, Math.ceil((bounds.east - bounds.west) / CELL_DEG)));
  const rows = Math.min(MAX_CELLS, Math.max(1, Math.ceil((bounds.north - bounds.south) / CELL_DEG)));
  if (cols * rows <= 1) return fetchCell(bounds);

  const cells: Array<{ west: number; south: number; east: number; north: number }> = [];
  const dx = (bounds.east - bounds.west) / cols;
  const dy = (bounds.north - bounds.south) / rows;
  for (let i = 0; i < cols && cells.length < MAX_CELLS; i++) {
    for (let j = 0; j < rows && cells.length < MAX_CELLS; j++) {
      cells.push({
        west: bounds.west + i * dx,
        east: bounds.west + (i + 1) * dx,
        south: bounds.south + j * dy,
        north: bounds.south + (j + 1) * dy,
      });
    }
  }

  const byId = new Map<string, Feature>();
  for (let i = 0; i < cells.length; i += 6) {
    const batch = await Promise.all(
      cells.slice(i, i + 6).map((c) => fetchCell(c).catch(() => [] as Feature[]))
    );
    for (const list of batch) {
      for (const f of list) {
        const key = String((f as { id?: string }).id ?? JSON.stringify(f.geometry).slice(0, 80));
        if (!byId.has(key)) byId.set(key, f);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Lit la route sous un tracé. `points` : [lng, lat, alt, distance].
 */
export function readRoad(
  points: Array<[number, number, number, number]>,
  features: Feature[]
): RoadReport | null {
  if (points.length < 3 || features.length === 0) return null;
  const totalM = points[points.length - 1][3];
  const byKey = new Map<string, RoadStretch>();
  let covered = 0, narrowM = 0, unpavedM = 0, urbanM = 0;
  let minWidth: number | null = null;

  /* Le report sur le tronçon précédent existe pour franchir un trou : un pont,
     un rond-point absent de l'extrait. Sans limite, il comblait tout — sur la
     montée de Saint-Dié, 11 % du tour touchait vraiment un tronçon et le
     rapport en annonçait 90 %, ce qui rendait impossible le garde-fou d'en
     dessous et créditait 2,9 km de sentier là où il y en a 55 mètres. Cent
     mètres de report, pas davantage. */
  const MAX_CARRY_M = 100;
  let previous: Feature | null = null;
  let carriedM = 0;
  for (let i = 1; i < points.length; i++) {
    const step = points[i][3] - points[i - 1][3];
    if (step <= 0) continue;
    const match = nearest([points[i][0], points[i][1]], features);
    let f: Feature | null = match;
    if (match) {
      previous = match;
      carriedM = 0;
    } else if (previous && carriedM < MAX_CARRY_M) {
      f = previous;
      carriedM += step;
    } else {
      previous = null;
      carriedM = 0;
      continue;
    }
    if (!f) continue;
    const p = f.properties;
    covered += step;
    const nature = String(p.nature ?? "");
    const width = p.largeur_de_chaussee != null ? Number(p.largeur_de_chaussee) : null;
    const urban = Boolean(p.urbain);
    if (width != null && width > 0) {
      if (minWidth == null || width < minWidth) minWidth = width;
      if (width < 4.5) narrowM += step;
    }
    if (isUnpaved(nature)) unpavedM += step;
    if (urban) urbanM += step;

    const label = labelOf(p);
    const key = `${label}|${nature}|${width ?? ""}`;
    const s = byKey.get(key) ?? {
      label,
      classement: (p.cpx_classement_administratif as string) ?? null,
      nature,
      widthM: width,
      lanes: p.nombre_de_voies != null ? Number(p.nombre_de_voies) : null,
      urban,
      lengthM: 0,
    };
    s.lengthM += step;
    byKey.set(key, s);
  }
  if (covered / totalM < 0.5) return null;

  const stretches = [...byKey.values()]
    .map((s) => ({ ...s, lengthM: Math.round(s.lengthM) }))
    .filter((s) => s.lengthM >= 60)
    .sort((a, b) => b.lengthM - a.lengthM);

  const parts: string[] = [];
  if (unpavedM > totalM * 0.05) parts.push(`${Math.round(unpavedM / 100) / 10} km hors bitume`);
  if (narrowM > totalM * 0.2) parts.push(`${Math.round((narrowM / totalM) * 100)} % du tour sur moins de 4,5 m : on ne remonte pas à trois de front`);
  else if (minWidth != null && minWidth >= 6) parts.push("chaussée large partout, ça se replace facilement");
  if (urbanM > totalM * 0.4) parts.push("beaucoup de traversée de village : îlots, ralentisseurs, relances");
  const verdict = parts.length ? parts.join(" ; ") + "." : "Route de largeur ordinaire, sans surprise.";

  return {
    coveredShare: covered / totalM,
    minWidthM: minWidth,
    narrowM: Math.round(narrowM),
    unpavedM: Math.round(unpavedM),
    urbanM: Math.round(urbanM),
    totalM: Math.round(totalM),
    stretches,
    verdict: verdict[0].toUpperCase() + verdict.slice(1),
  };
}

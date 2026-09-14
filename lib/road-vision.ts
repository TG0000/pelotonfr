import Anthropic from "@anthropic-ai/sdk";

/**
 * Lire la route sur une photo, comme un coureur qui reconnaît le circuit.
 *
 * L'IGN mesure la largeur ; la photo dit le reste : l'enrobé, s'il est lisse
 * ou grenu, rapiécé, gravillonné (un enduit superficiel, ce qui roule mal et
 * glisse en virage), s'il y a des gravillons libres, si les bas-côtés sont
 * propres ou pleins de terre. Une photo est lue une fois ; le résultat est
 * rangé et plus jamais redemandé.
 */

export type Surface =
  | "enrobé lisse"
  | "enrobé grenu"
  | "enduit gravillonné"
  | "rapiécé"
  | "béton"
  | "pavés"
  | "gravier"
  | "terre"
  | "inconnu";

export type Condition = "bon" | "moyen" | "dégradé" | "inconnu";

/** Ce qui borde la route d'un côté, vu dans le sens de la course. */
export type Cover = "ouvert" | "haie basse" | "haie haute" | "arbres" | "bâti" | "talus" | "inconnu";
export const COVERS: Cover[] = ["ouvert", "haie basse", "haie haute", "arbres", "bâti", "talus", "inconnu"];
/** Ce qui abrite vraiment d'un vent de travers. */
export function shelters(c: Cover | null | undefined): boolean | null {
  if (!c || c === "inconnu") return null;
  return c !== "ouvert" && c !== "haie basse";
}

/** Un danger vu sur la photo, à l'endroit de la photo. */
export type HazardKind =
  | "virage serré" | "dévers" | "glissière" | "ralentisseur" | "îlot" | "rond-point"
  | "chaussée rétrécie" | "gravillons" | "nid-de-poule" | "pavés" | "rails" | "plaque"
  | "passage à niveau" | "traversée" | "descente rapide" | "autre";
export const HAZARD_KINDS: HazardKind[] = ["virage serré", "dévers", "glissière", "ralentisseur", "îlot", "rond-point", "chaussée rétrécie", "gravillons", "nid-de-poule", "pavés", "rails", "plaque", "passage à niveau", "traversée", "descente rapide", "autre"];
export interface Hazard {
  kind: HazardKind;
  /** 1 : à savoir, 2 : à anticiper, 3 : ça fait tomber. */
  severity: 1 | 2 | 3;
  note: string | null;
}

export interface RoadReading {
  surface: Surface;
  condition: Condition;
  /** Gravillons libres visibles sur la chaussée. */
  looseGravel: boolean;
  /** Fissures, nids-de-poule, affaissements. */
  potholes: boolean;
  /** Marquage axial ou latéral présent. */
  markings: boolean;
  /** « propres », « herbe », « terre », « gravier », ou null. */
  shoulders: string | null;
  /** Largeur estimée en mètres, ou null. */
  widthM: number | null;
  /** Bas-côté gauche et droit, dans le sens de la course. */
  coverLeft: Cover | null;
  coverRight: Cover | null;
  /** Ce qu'un coureur retiendrait, une phrase. */
  note: string | null;
  /** Les dangers vus, pour les poser sur la carte. Vide si rien. */
  hazards: Hazard[];
  /** 0 à 1 : la photo permet-elle vraiment de juger. */
  confidence: number;
}

const SYSTEM = `Tu regardes une photo prise depuis la route (dashcam, téléphone ou caméra 360° en projection équirectangulaire : dans ce cas la route est au bas de l'image, devant et derrière). Tu décris le REVÊTEMENT de la chaussée pour un cycliste qui va y courir. Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec exactement ces clés :

  surface      un de : "enrobé lisse", "enrobé grenu", "enduit gravillonné", "rapiécé", "béton", "pavés", "gravier", "terre", "inconnu"
  condition    un de : "bon", "moyen", "dégradé", "inconnu"
  looseGravel  true si des gravillons libres sont visibles sur la chaussée
  potholes     true si nids-de-poule, fissures larges ou affaissements visibles
  markings     true si un marquage au sol (axe ou rive) est visible
  shoulders    "propres", "herbe", "terre", "gravier", ou null si invisible
  coverLeft    ce qui borde la route À GAUCHE de l'image : "ouvert" (champ, vue dégagée), "haie basse" (sous 1,5 m), "haie haute", "arbres", "bâti" (maisons, murs), "talus", ou "inconnu"
  coverRight   la même chose À DROITE de l'image
  widthM       largeur estimée de la chaussée en mètres (nombre) ou null
  note         une phrase courte, en français, que retiendrait un coureur, ou null
  hazards      tableau, vide si rien, d'objets {kind, severity, note} : kind parmi "virage serré", "dévers", "glissière", "ralentisseur", "îlot", "rond-point", "chaussée rétrécie", "gravillons", "nid-de-poule", "pavés", "rails", "plaque", "passage à niveau", "traversée", "descente rapide", "autre" ; severity 1 (à savoir), 2 (à anticiper en peloton), 3 (ça fait tomber) ; note courte ou null
  confidence   nombre entre 0 et 1

Règles :
- "enduit gravillonné" = enduit superficiel à gravillons apparents (aspect rugueux, clair, granuleux), fréquent sur les petites routes de campagne ; "enrobé grenu" = enrobé bitumineux classique un peu rugueux ; "enrobé lisse" = enrobé récent, sombre et uni.
- Si la route est trop loin, floue, mouillée au point de ne rien voir, ou de nuit : surface "inconnu", confidence basse. Ne devine pas.
- Un danger n'est signalé que s'il est visible sur la chaussée ou à son bord immédiat, devant : un îlot au loin compte, une voiture garée ne compte pas, la circulation ne compte pas, un passage piéton ne compte pas. « virage serré » seulement si la route tourne franchement (plus de 60°) ou si la visibilité est coupée ; un léger virage n'est pas un danger, ne le signale pas. Une glissière compte parce qu'un peloton n'a plus d'échappatoire de ce côté. Un peloton à 45 km/h dans un virage serré sur gravillons, c'est severity 3. En cas de doute, ne signale rien.
- Pour coverLeft/coverRight, juge sur les cinquante premiers mètres devant la caméra, pas à l'horizon : un champ derrière une haie haute, c'est "haie haute".
- Ne parle que de la chaussée visible et de ses bords, pas du paysage.`;

export async function readRoadPicture(
  imageBytes: Uint8Array,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = "claude-sonnet-5"
): Promise<{ reading: RoadReading | null; inputTokens: number; outputTokens: number } | null> {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(imageBytes).toString("base64") } },
          { type: "text", text: "Décris le revêtement." },
        ],
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  const cost = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const SURFACES: Surface[] = ["enrobé lisse", "enrobé grenu", "enduit gravillonné", "rapiécé", "béton", "pavés", "gravier", "terre", "inconnu"];
    const CONDS: Condition[] = ["bon", "moyen", "dégradé", "inconnu"];
    const reading: RoadReading = {
      surface: SURFACES.includes(p.surface as Surface) ? (p.surface as Surface) : "inconnu",
      condition: CONDS.includes(p.condition as Condition) ? (p.condition as Condition) : "inconnu",
      looseGravel: p.looseGravel === true,
      potholes: p.potholes === true,
      markings: p.markings === true,
      shoulders: typeof p.shoulders === "string" ? p.shoulders : null,
      coverLeft: COVERS.includes(p.coverLeft as Cover) ? (p.coverLeft as Cover) : null,
      coverRight: COVERS.includes(p.coverRight as Cover) ? (p.coverRight as Cover) : null,
      widthM: typeof p.widthM === "number" && p.widthM > 0 && p.widthM < 20 ? p.widthM : null,
      note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : null,
      hazards: Array.isArray(p.hazards)
        ? (p.hazards as Array<Record<string, unknown>>)
            .filter((h) => h && typeof h === "object")
            .map((h) => ({
              kind: HAZARD_KINDS.includes(h.kind as HazardKind) ? (h.kind as HazardKind) : ("autre" as HazardKind),
              severity: (h.severity === 3 ? 3 : h.severity === 2 ? 2 : 1) as 1 | 2 | 3,
              note: typeof h.note === "string" && h.note.trim() ? h.note.trim() : null,
            }))
            .slice(0, 4)
        : [],
      confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0,
    };
    return { reading, ...cost };
  } catch {
    return { reading: null, ...cost };
  }
}

/** Ce que plusieurs photos disent ensemble, en une lecture. */
export interface RoadSeen {
  pictures: number;
  /** Le revêtement dominant, par nombre de photos. */
  surface: Surface;
  /** Le pire état vu. */
  worst: Condition;
  gravelSpots: number;
  potholeSpots: number;
  /** La phrase pour le brief, ou null si rien de notable. */
  verdict: string | null;
}

export function summarise(readings: RoadReading[]): RoadSeen | null {
  const usable = readings.filter((r) => r.surface !== "inconnu" && r.confidence >= 0.4);
  if (usable.length === 0) return null;
  const count = new Map<Surface, number>();
  for (const r of usable) count.set(r.surface, (count.get(r.surface) ?? 0) + 1);
  const surface = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const order: Condition[] = ["bon", "moyen", "dégradé"];
  let worst: Condition = "bon";
  for (const r of usable) if (order.indexOf(r.condition) > order.indexOf(worst)) worst = r.condition;
  const gravelSpots = usable.filter((r) => r.looseGravel).length;
  const potholeSpots = usable.filter((r) => r.potholes).length;
  const severe = usable.flatMap((r) => r.hazards ?? []).filter((h) => h.severity >= 2);

  const parts: string[] = [];
  if (surface === "enduit gravillonné") parts.push("enduit gravillonné : ça roule mal et ça glisse en virage");
  else if (surface === "rapiécé") parts.push("enrobé rapiécé, tiens ta ligne");
  else if (surface === "enrobé lisse") parts.push("enrobé lisse, rapide");
  else if (surface === "enrobé grenu") parts.push("enrobé ordinaire");
  else parts.push(surface);
  if (worst === "dégradé") parts.push("par endroits dégradé");
  if (gravelSpots > 0) parts.push(`gravillons vus sur ${gravelSpots} photo${gravelSpots > 1 ? "s" : ""}`);
  if (potholeSpots > 0) parts.push(`nids-de-poule sur ${potholeSpots}`);
  if (severe.length > 0) parts.push(`${severe.length} danger${severe.length > 1 ? "s" : ""} à anticiper (${[...new Set(severe.map((h) => h.kind))].join(", ")})`);
  const verdict =
    surface === "enrobé grenu" && worst === "bon" && gravelSpots === 0 && potholeSpots === 0 && severe.length === 0
      ? null
      : `Revêtement vu en photo : ${parts.join(", ")}.`;
  return { pictures: usable.length, surface, worst, gravelSpots, potholeSpots, verdict };
}

/**
 * Le vent posé sur les bas-côtés.
 *
 * Un vent de trois quarts ne casse un peloton que là où rien ne l'arrête :
 * champ ouvert du côté d'où il vient. Pour chaque photo on sait le sens de la
 * course et ce qui borde la route de chaque côté ; le vent dit de quel côté il
 * frappe. Une photo qui regardait en arrière a ses côtés inversés, une photo
 * de travers ne compte pas.
 */
export interface ShelterSpot {
  alongM: number;
  /** "gauche" ou "droite" : d'où le vent frappe, pour le coureur. */
  side: "gauche" | "droite";
  /** Force du travers, 0 (face ou dos) à 1 (plein travers). */
  cross: number;
  cover: Cover;
  exposed: boolean;
}

export function windShelter(
  views: Array<{ alongM: number | null; bearing: number | null; orientation: string | null; reading: RoadReading | null }>,
  windFromDeg: number
): { spots: ShelterSpot[]; verdict: string | null } {
  const spots: ShelterSpot[] = [];
  for (const v of views) {
    if (v.alongM == null || v.bearing == null || !v.reading) continue;
    if (v.orientation !== "avant" && v.orientation !== "arrière") continue;
    let left = v.reading.coverLeft;
    let right = v.reading.coverRight;
    if (v.orientation === "arrière") [left, right] = [right, left];
    const rel = ((windFromDeg - v.bearing) % 360 + 540) % 360 - 180; // ]-180,180]
    const cross = Math.abs(Math.sin((rel * Math.PI) / 180));
    if (cross < 0.5) continue; // vent de face ou de dos : les bas-côtés ne comptent pas
    const side: "gauche" | "droite" = rel > 0 ? "droite" : "gauche";
    const cover = side === "droite" ? right : left;
    const sh = shelters(cover);
    if (sh == null || !cover) continue;
    spots.push({ alongM: v.alongM, side, cross, cover, exposed: !sh });
  }
  if (spots.length === 0) return { spots, verdict: null };
  const exposed = spots.filter((s) => s.exposed);
  const km = (m: number) => (m / 1000).toFixed(1).replace(".", ",");
  if (exposed.length === 0) {
    return { spots, verdict: `Vent de travers, mais les bas-côtés abritent là où on a vu la route (${spots.map((s) => `km ${km(s.alongM)} : ${s.cover}`).join(", ")}).` };
  }
  const sides = new Set(exposed.map((s) => s.side));
  const where = exposed.map((s) => `km ${km(s.alongM)}`).join(", ");
  const side = sides.size === 1 ? [...sides][0] : "des deux côtés";
  return {
    spots,
    verdict: `Bordure possible ${where} : vent de travers ${side === "des deux côtés" ? side : `par la ${side}`}, bas-côté ouvert de ce côté. Sois placé devant avant.`,
  };
}

/** Les dangers de toutes les photos, placés au kilomètre, les pires d'abord. */
export function hazardsAlong(
  views: Array<{ alongM: number | null; reading: RoadReading | null }>
): Array<Hazard & { alongM: number }> {
  const out: Array<Hazard & { alongM: number }> = [];
  for (const v of views) {
    if (v.alongM == null || !v.reading) continue;
    for (const h of v.reading.hazards ?? []) out.push({ ...h, alongM: v.alongM });
  }
  return out.sort((a, b) => b.severity - a.severity || a.alongM - b.alongM);
}

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
  /**
   * Grain du revêtement de 1 (lisse) à 5 (très granuleux), jugé en
   * comparant les photos d'un même circuit entre elles : l'œil classe mieux
   * qu'il n'évalue dans l'absolu. Null tant que la comparaison n'a pas eu lieu.
   */
  texture: number | null;
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
      texture: null,
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

/** Le revêtement dit comme un coureur le dirait. */
function surfaceLabel(surface: Surface): string {
  if (surface === "enduit gravillonné") return "enduit gravillonné";
  if (surface === "rapiécé") return "enrobé rapiécé";
  if (surface === "enrobé lisse") return "enrobé lisse";
  if (surface === "enrobé grenu") return "enrobé ordinaire";
  return surface;
}

/**
 * La phrase du panneau, dans les trois cas.
 *
 * `summarise` rend `verdict: null` quand la route est ordinaire et qu'il n'y a
 * rien à signaler : c'est ce qui empêche le brief de dire « la route va bien »,
 * ce dont personne n'a besoin. Le panneau, lui, doit dire quelque chose — et
 * surtout ne pas confondre « rien à signaler » avec « on n'a pas su lire ».
 */
export function seenSentence(seen: RoadSeen | null): string {
  if (!seen) return "Revêtement trop incertain sur ces photos pour se prononcer.";
  if (seen.verdict) return seen.verdict;
  return `Revêtement vu en photo : ${surfaceLabel(seen.surface)} en bon état.`;
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

/**
 * Classer les photos d'un même circuit par grain du revêtement.
 *
 * Six photos lues une à une donnent six fois « enrobé grenu, bon » : dans
 * l'absolu, tout enrobé de campagne se ressemble. Côte à côte, l'écart se
 * voit — la rue du bourg du km 0,2 est plus rugueuse que la départementale
 * du km 3,5, et un coureur qui connaît la boucle le confirme. Une requête,
 * toutes les images, un grain de 1 à 5 pour chacune.
 */
export async function rankTextures(
  crops: Array<{ id: string; bytes: Uint8Array }>,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = "claude-sonnet-5"
): Promise<{ textures: Map<string, number>; inputTokens: number; outputTokens: number } | null> {
  if (!apiKey || crops.length < 2) return null;
  const client = new Anthropic({ apiKey });
  const content: Anthropic.MessageParam["content"] = [];
  crops.forEach((c, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(c.bytes).toString("base64") } });
  });
  content.push({
    type: "text",
    text:
      `Ces ${crops.length} photos sont prises sur le même circuit de course cycliste. Compare le GRAIN du revêtement de la chaussée entre elles ` +
      `(granulosité de l'enrobé : lisse et fermé, ou ouvert avec gravillons apparents, ou enduit superficiel rugueux). Ne juge pas l'état ni la propreté, seulement le grain. ` +
      `Réponds UNIQUEMENT par un tableau JSON, un objet par photo, dans l'ordre : [{"photo":1,"visible":true,"texture":3,"why":"…"}, …] avec texture de 1 (le plus lisse) à 5 (le plus granuleux). ` +
      `"visible" : true seulement si le grain de la chaussée est réellement discernable sur la photo (chaussée proche, nette, bien éclairée) ; false si la route n'est qu'une surface grise floue, et alors texture null. ` +
      `Utilise toute l'échelle si les photos diffèrent ; donne la même valeur à deux photos identiques. Ne devine pas : une photo de dashcam en basse définition ne montre pas le grain. "why" : cinq mots, en français.`,
  });
  const response = await client.messages.create({ model, max_tokens: 600, messages: [{ role: "user", content }] });
  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const textures = new Map<string, number>();
  try {
    const arr = JSON.parse(text) as Array<{ photo?: number; visible?: boolean; texture?: number | null }>;
    for (const it of arr) {
      const i = Number(it.photo) - 1;
      const t = Number(it.texture);
      if (crops[i] && it.visible !== false && t >= 1 && t <= 5) textures.set(crops[i].id, Math.round(t));
    }
    // Un grain seul ne se compare à rien.
    if (textures.size < 2) textures.clear();
  } catch {
    /* réponse illisible : pas de grain cette fois */
  }
  return { textures, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

/** Les portions du tour sans aucune photo : là où l'on est aveugle. */
export function blindSpots(
  views: Array<{ alongM: number | null }>,
  lapM: number,
  minGapM = 800
): Array<{ fromM: number; toM: number }> {
  const marks = views.map((v) => v.alongM).filter((a): a is number => a != null).sort((a, b) => a - b);
  if (lapM <= 0) return [];
  const out: Array<{ fromM: number; toM: number }> = [];
  let prev = 0;
  for (const m of [...marks, lapM]) {
    if (m - prev >= minGapM) out.push({ fromM: prev, toM: m });
    prev = m;
  }
  // Boucle : la fin et le début se touchent.
  if (marks.length > 0 && out.length > 1 && out[0].fromM === 0 && out[out.length - 1].toM === lapM) {
    const last = out.pop()!;
    out[0] = { fromM: last.fromM, toM: out[0].toM };
  }
  return out;
}

/** La date avant laquelle une photo ne dit plus rien de la route d'aujourd'hui. */
export function recentCutoff(now = new Date()): string {
  return new Date(now.getTime() - 5 * 365 * 86_400_000).toISOString().slice(0, 10);
}

/** Les textures d'un circuit, dites en une phrase, ou null si tout se vaut. */
export function textureVerdict(views: Array<{ alongM: number | null; takenOn?: string | null; reading: RoadReading | null }>): string | null {
  /* Un grain lu sur une dashcam de 2016 ne dit rien de la route de 2026 : on
     ne compare que des photos de moins de cinq ans, sinon on se tait. */
  const cutoff = recentCutoff();
  const t = views.filter((v) => v.alongM != null && v.reading?.texture != null && (!v.takenOn || v.takenOn >= cutoff)) as Array<{ alongM: number; reading: RoadReading & { texture: number } }>;
  if (t.length < 2) return null;
  const max = Math.max(...t.map((v) => v.reading.texture));
  const min = Math.min(...t.map((v) => v.reading.texture));
  if (max - min < 2) return null;
  const km = (m: number) => (m / 1000).toFixed(1).replace(".", ",");
  const rough = t.filter((v) => v.reading.texture === max).map((v) => `km ${km(v.alongM)}`);
  const smooth = t.filter((v) => v.reading.texture === min).map((v) => `km ${km(v.alongM)}`);
  return `Le grain change : plus rugueux ${rough.join(", ")}, plus roulant ${smooth.join(", ")}.`;
}

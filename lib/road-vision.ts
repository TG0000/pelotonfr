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
  /** Ce qu'un coureur retiendrait, une phrase. */
  note: string | null;
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
  widthM       largeur estimée de la chaussée en mètres (nombre) ou null
  note         une phrase courte, en français, que retiendrait un coureur, ou null
  confidence   nombre entre 0 et 1

Règles :
- "enduit gravillonné" = enduit superficiel à gravillons apparents (aspect rugueux, clair, granuleux), fréquent sur les petites routes de campagne ; "enrobé grenu" = enrobé bitumineux classique un peu rugueux ; "enrobé lisse" = enrobé récent, sombre et uni.
- Si la route est trop loin, floue, mouillée au point de ne rien voir, ou de nuit : surface "inconnu", confidence basse. Ne devine pas.
- Ne parle que de la chaussée visible, pas du paysage.`;

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
      widthM: typeof p.widthM === "number" && p.widthM > 0 && p.widthM < 20 ? p.widthM : null,
      note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : null,
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

  const parts: string[] = [];
  if (surface === "enduit gravillonné") parts.push("enduit gravillonné : ça roule mal et ça glisse en virage");
  else if (surface === "rapiécé") parts.push("enrobé rapiécé, tiens ta ligne");
  else if (surface === "enrobé lisse") parts.push("enrobé lisse, rapide");
  else if (surface === "enrobé grenu") parts.push("enrobé ordinaire");
  else parts.push(surface);
  if (worst === "dégradé") parts.push("par endroits dégradé");
  if (gravelSpots > 0) parts.push(`gravillons vus sur ${gravelSpots} photo${gravelSpots > 1 ? "s" : ""}`);
  if (potholeSpots > 0) parts.push(`nids-de-poule sur ${potholeSpots}`);
  const verdict =
    surface === "enrobé grenu" && worst === "bon" && gravelSpots === 0 && potholeSpots === 0
      ? null
      : `Revêtement vu en photo : ${parts.join(", ")}.`;
  return { pictures: usable.length, surface, worst, gravelSpots, potholeSpots, verdict };
}

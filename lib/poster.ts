import Anthropic from "@anthropic-ai/sdk";

/**
 * Lire une affiche de course.
 *
 * Les guides techniques ne sortent que pour les grandes épreuves. Les courses
 * ordinaires — la majorité — n'ont qu'une affiche, et l'affiche dit tout :
 * « Circuit de 1.1 km », « Dossards : 13h », « 1er Départ : 14h ».
 *
 * Un OCR classique bute dessus : polices manuscrites, texte coloré sur photo,
 * mise en page décorative où l'ordre de lecture n'est pas celui des pixels. Un
 * modèle de vision lit l'affiche comme un humain la lit — il comprend qu'un
 * nombre à côté du mot « circuit » est une longueur de tour, et pas le numéro
 * du département.
 *
 * Ce qu'il ne trouve pas, il le dit : chaque champ est nul par défaut, et
 * l'instruction est explicite sur le fait qu'inventer est pire que rendre
 * vide. Une affiche mal lue écrit une fausse longueur de circuit sur une page
 * que personne ne pourra corriger.
 */

export interface PosterReading {
  /** Longueur d'un tour, en mètres. */
  circuitM: number | null;
  lapCount: number | null;
  /** « 13h », « 13h30 » — tel que l'affiche l'écrit. */
  bibPickupTime: string | null;
  bibPickupPlace: string | null;
  /** Heure du premier départ. */
  firstStartTime: string | null;
  organiser: string | null;
  /** Ce que l'affiche annonce comme commune. Sert à vérifier le rattachement. */
  place: string | null;
  /** Ce que le modèle a jugé lisible, de 0 à 1. */
  confidence: number;
}

const SYSTEM = `Tu lis des affiches de courses cyclistes amateurs françaises.

Tu rends un objet JSON et rien d'autre — pas de texte avant, pas de bloc de
code. Les clés sont exactement :

  circuitM        longueur d'UN tour en mètres (nombre entier) ou null
  lapCount        nombre de tours (nombre entier) ou null
  bibPickupTime   heure de remise des dossards, ex "13h" ou "13h30", ou null
  bibPickupPlace  lieu de remise des dossards, ou null
  firstStartTime  heure du premier départ, ex "14h", ou null
  organiser       club organisateur, ou null
  place           commune où se court l'épreuve, ou null
  confidence      ta confiance dans la lecture, entre 0 et 1

Règles :
- « Circuit de 1.1 km » donne circuitM 1100. « Circuit de 7 km à parcourir
  11 fois » donne circuitM 7000 et lapCount 11.
- Une distance totale de course n'est PAS une longueur de tour. Si l'affiche
  annonce « 70 km » sans parler de circuit ni de tours, circuitM reste null.
- Ne déduis rien d'une carte ou d'un plan : seuls les mots comptent.
- Un champ absent vaut null. Inventer une valeur est bien pire que rendre null :
  ces chiffres sont affichés à des coureurs qui n'ont aucun moyen de les
  vérifier.`;

export async function readPoster(
  imageBytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png",
  apiKey = process.env.ANTHROPIC_API_KEY
): Promise<PosterReading | null> {
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: Buffer.from(imageBytes).toString("base64"),
            },
          },
          { type: "text", text: "Lis cette affiche." },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Le modèle rend du JSON nu, mais une clôture en bloc de code coûte moins
  // cher à tolérer qu'à interdire.
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "");

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    const circuitM = num(parsed.circuitM);
    return {
      // Sous huit cents mètres c'est une ligne d'arrivée, au-delà de quarante
      // kilomètres c'est la course entière.
      circuitM: circuitM && circuitM >= 800 && circuitM <= 40_000 ? Math.round(circuitM) : null,
      lapCount: (() => {
        const n = num(parsed.lapCount);
        return n && n >= 1 && n <= 60 ? Math.round(n) : null;
      })(),
      bibPickupTime: str(parsed.bibPickupTime),
      bibPickupPlace: str(parsed.bibPickupPlace)?.slice(0, 160) ?? null,
      firstStartTime: str(parsed.firstStartTime),
      organiser: str(parsed.organiser),
      place: str(parsed.place),
      confidence: num(parsed.confidence) ?? 0,
    };
  } catch {
    return null;
  }
}

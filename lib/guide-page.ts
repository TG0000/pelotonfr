import Anthropic from "@anthropic-ai/sdk";

/**
 * Lire une page de guide technique.
 *
 * Le guide d'un tour est un document scanné d'une vingtaine de pages : la
 * couverture, le règlement, la liste des équipes, puis — la seule chose qui
 * nous intéresse — l'itinéraire horaire de chaque étape, kilomètre par
 * kilomètre, avec les communes traversées, les routes empruntées, les côtes
 * classées et les sprints.
 *
 * Ces pages sont des tableaux scannés, souvent de travers, parfois sur deux
 * colonnes. C'est exactement ce qu'un OCR rend en bouillie et ce qu'un modèle
 * de vision lit sans effort.
 *
 * Une page est lue UNE FOIS. Le résultat est rangé et ne se recalcule jamais :
 * le document ne changera plus, et relire coûte de l'argent pour rien.
 */

export type PageKind =
  | "itineraire"
  | "profil"
  | "horaires"
  | "reglement"
  | "engages"
  | "carte"
  | "autre";

/** Un point de passage de l'itinéraire horaire. */
export interface RoutePoint {
  /** Kilomètre depuis le départ de l'étape. */
  km: number | null;
  /** Ce qu'on traverse : une commune, un lieu-dit, un carrefour. */
  place: string;
  /** La route empruntée pour y aller, « D909 ». */
  road: string | null;
  /** « Côte de la Butte », « sprint », « ravitaillement ». */
  note: string | null;
}

export interface GuidePageReading {
  kind: PageKind;
  /** L'étape décrite par cette page, quand la page le dit. */
  stageNumber: number | null;
  points: RoutePoint[];
  confidence: number;
}

const SYSTEM = `Tu lis les pages scannées du guide technique d'une course
cycliste par étapes en France.

Tu rends un objet JSON et rien d'autre — pas de texte avant, pas de bloc de
code. Les clés sont exactement :

  kind          l'un de : "itineraire", "profil", "horaires", "reglement",
                "engages", "carte", "autre"
  stageNumber   le numéro de l'étape décrite (entier) ou null
  points        la liste des points de passage, vide si la page n'en a pas
  confidence    ta confiance dans la lecture, entre 0 et 1

Chaque élément de "points" a exactement les clés :

  km      kilomètre depuis le départ de l'étape (nombre) ou null
  place   la commune, le lieu-dit ou le carrefour traversé (texte)
  road    la route empruntée, ex "D909", "N12", ou null
  note    "côte", "sprint", "ravitaillement", le nom d'une difficulté, ou null

Règles :
- "itineraire" désigne une page qui énumère les points de passage dans l'ordre,
  généralement avec un kilométrage. C'est la seule page qui doit remplir
  "points".
- Sur un itinéraire, le kilométrage peut être compté à l'endroit (distance
  parcourue) ou à l'envers (distance restante). Rends TOUJOURS la distance
  depuis le départ. Si la page compte à l'envers, convertis-la.
- Respecte l'ordre du document : le premier point est le départ.
- Écris les communes telles qu'elles sont imprimées, sans les corriger.
- Une page de profil, de règlement ou de liste d'engagés rend "points" vide.
  N'invente pas un itinéraire à partir d'une carte : seuls les mots comptent.
- Ce qui est illisible n'existe pas. Rendre moins de points est sans gravité ;
  inventer une commune envoie un coureur sur une route qui n'est pas la
  sienne.`;

export interface PageCost {
  inputTokens: number;
  outputTokens: number;
}

export async function readGuidePage(
  imageBytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png",
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = "claude-sonnet-5"
): Promise<{ reading: GuidePageReading | null; cost: PageCost } | null> {
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    // Une page dense rend trois mille jetons ; sous huit mille on risque
    // une réponse coupée, donc un JSON illisible et une page payée pour rien.
    max_tokens: 8192,
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
          { type: "text", text: "Lis cette page du guide." },
        ],
      },
    ],
  });

  const cost: PageCost = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "");

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    const kinds: PageKind[] = [
      "itineraire", "profil", "horaires", "reglement", "engages", "carte", "autre",
    ];
    const kind = kinds.includes(parsed.kind as PageKind)
      ? (parsed.kind as PageKind)
      : "autre";

    const raw = Array.isArray(parsed.points) ? parsed.points : [];
    const points: RoutePoint[] = raw
      .map((p) => (typeof p === "object" && p ? (p as Record<string, unknown>) : {}))
      .map((p) => ({
        // Une étape de plus de trois cents kilomètres n'existe pas chez les
        // amateurs : au-delà, c'est une altitude ou un horaire mal lu.
        km: (() => {
          const n = num(p.km);
          return n !== null && n >= 0 && n <= 300 ? n : null;
        })(),
        place: str(p.place) ?? "",
        road: str(p.road)?.slice(0, 20) ?? null,
        note: str(p.note)?.slice(0, 80) ?? null,
      }))
      .filter((p) => p.place.length > 1);

    return {
      reading: {
        kind,
        stageNumber: (() => {
          const n = num(parsed.stageNumber);
          return n && n >= 1 && n <= 30 ? Math.round(n) : null;
        })(),
        points,
        confidence: num(parsed.confidence) ?? 0,
      },
      cost,
    };
  } catch {
    return { reading: null, cost };
  }
}

/**
 * The lie of the land around a race.
 *
 * Organisers publish a course profile roughly never, and the trace itself is
 * only available where a rider has ridden it. But the terrain a circuit is cut
 * into is public everywhere, and it already answers the question a rider is
 * really asking: is this an afternoon in the wind on flat roads, or will it go
 * uphill often enough to matter.
 *
 * Sampled from Open-Meteo's elevation service, which needs no key.
 */

const API = "https://api.open-meteo.com/v1/elevation";

/** A square roughly 12 km across — the scale a village circuit is drawn at. */
const GRID = 7;
const STEP_LAT = 0.018; // ~2 km
const STEP_LNG = 0.027; // ~2 km at these latitudes

export type TerrainKind =
  | "plat"
  | "légèrement vallonné"
  | "vallonné"
  | "accidenté"
  | "montagneux";

export interface Terrain {
  /** Lowest and highest ground in the sampled square. */
  minM: number;
  maxM: number;
  /** How much ground lies between them. */
  amplitudeM: number;
  /**
   * Mean height change between neighbouring samples. Separates one long climb
   * from ground that never stops moving — which is what actually wears a bunch
   * down over a dozen laps.
   */
  roughnessM: number;
  kind: TerrainKind;
  /** What that means for the race, in a rider's terms. */
  verdict: string;
}

function classify(amplitudeM: number): TerrainKind {
  if (amplitudeM < 40) return "plat";
  if (amplitudeM < 100) return "légèrement vallonné";
  if (amplitudeM < 200) return "vallonné";
  if (amplitudeM < 400) return "accidenté";
  return "montagneux";
}

function verdictFor(kind: TerrainKind, roughnessM: number): string {
  // Above this the ground changes at every sample, so the circuit almost
  // certainly climbs several times a lap rather than once.
  const relentless = roughnessM >= 12;

  switch (kind) {
    case "plat":
      return "Terrain plat : la course se jouera au vent et au placement.";
    case "légèrement vallonné":
      return relentless
        ? "Faux plats à répétition — usant sans jamais casser."
        : "Quelques mouvements de terrain, sans difficulté marquée.";
    case "vallonné":
      return relentless
        ? "Ça monte et ça descend sans arrêt : une course d'usure."
        : "Relief franc, avec de quoi faire la sélection.";
    case "accidenté":
      return "Terrain accidenté : le dénivelé fera le tri.";
    case "montagneux":
      return "Terrain de montagne : la course se jouera dans les cols.";
  }
}

/**
 * Reads the terrain around a point, or null when the service does not answer.
 *
 * Deliberately tolerant: this is context, not a fact the page depends on, and
 * a race is perfectly readable without it.
 */
export async function getTerrain(
  lat: number,
  lng: number
): Promise<Terrain | null> {
  const lats: number[] = [];
  const lngs: number[] = [];
  const half = Math.floor(GRID / 2);

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      lats.push(Number((lat + dy * STEP_LAT).toFixed(4)));
      lngs.push(Number((lng + dx * STEP_LNG).toFixed(4)));
    }
  }

  try {
    const res = await fetch(
      `${API}?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`,
      // The ground does not move; a day is a conservative cache.
      { next: { revalidate: 86_400 } }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { elevation?: number[] };
    const e = data.elevation;
    if (!e || e.length < GRID * GRID) return null;

    const minM = Math.min(...e);
    const maxM = Math.max(...e);

    // Neighbour differences along both axes of the grid.
    let deltas = 0;
    let count = 0;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const here = e[row * GRID + col];
        if (col + 1 < GRID) {
          deltas += Math.abs(e[row * GRID + col + 1] - here);
          count++;
        }
        if (row + 1 < GRID) {
          deltas += Math.abs(e[(row + 1) * GRID + col] - here);
          count++;
        }
      }
    }

    const roughnessM = count > 0 ? deltas / count : 0;
    const amplitudeM = maxM - minM;
    const kind = classify(amplitudeM);

    return {
      minM: Math.round(minM),
      maxM: Math.round(maxM),
      amplitudeM: Math.round(amplitudeM),
      roughnessM: Math.round(roughnessM * 10) / 10,
      kind,
      verdict: verdictFor(kind, roughnessM),
    };
  } catch {
    return null;
  }
}

import type { SqlLike } from "./types";
import { normalizeTitle, raceTitleCore } from "./match-races";

/**
 * La sortie qui documente un circuit, même des années plus tard.
 *
 * L'appariement d'une sortie à une course exige le même jour, et c'est juste :
 * attribuer un résultat au mauvais coureur serait pire que ne rien attribuer.
 * Mais pour un *tracé*, la date ne compte pas. Un coureur qui court depuis cinq
 * ans a déjà parcouru la plupart des circuits de sa région, et il les a nommés
 * lui-même dans Strava — « Buais », « Carnet », « Louvigne du desert ». Ces
 * boucles n'ont pas changé, et ce sont exactement celles qui manquent aux pages
 * course.
 *
 * Deux conditions, toutes les deux nécessaires : le titre ressemble au nom du
 * rendez-vous, et la sortie part d'à côté. Le nom seul rattacherait une sortie
 * d'entraînement passée par le village ; la proximité seule rattacherait tout
 * ce qui part de chez soi.
 */

/** Sørensen–Dice sur les bigrammes : « Buias » doit trouver Buais. */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (v: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < v.length - 1; i++) {
      const g = v.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let shared = 0;
  for (const [g, n] of ga) shared += Math.min(n, gb.get(g) ?? 0);
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

/** Titres qui ne nomment aucune course. */
const GENERIC =
  /^(ride|sortie|velo|v[ée]lo|entrainement|entra[îi]nement|training|course|race|matin|midi|soir|morning|afternoon|evening|home|wahoo|zwift|recup|r[ée]cup|endurance|footing|cyclisme)/i;

export interface CircuitDonor {
  raceId: string;
  raceName: string;
  score: number;
  metres: number;
}

export async function matchRideToCircuit(
  sql: SqlLike,
  ride: {
    name: string;
    lat: number | null;
    lng: number | null;
    distanceM: number;
  }
): Promise<CircuitDonor | null> {
  if (ride.lat == null || ride.lng == null) return null;

  const title = normalizeTitle(ride.name);
  if (!title || title.length < 3 || GENERIC.test(ride.name.trim())) return null;

  // Une sortie de vingt kilomètres n'est pas une course ; une de trois cents
  // est une randonnée qui a traversé le village.
  if (ride.distanceM < 25_000 || ride.distanceM > 220_000) return null;

  const rows = await sql(
    `SELECT r.id, r.name, r.city,
            ST_Distance(r.location, ST_MakePoint($1::float8, $2::float8)::geography) AS metres
       FROM races r
      WHERE r.location IS NOT NULL
        AND r.discipline = 'route'
        AND ST_DWithin(r.location, ST_MakePoint($1::float8, $2::float8)::geography, 6000)
      ORDER BY metres
      LIMIT 40`,
    [ride.lng, ride.lat]
  );

  let best: CircuitDonor | null = null;
  const joined = title.replace(/ /g, "");

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const core = raceTitleCore(r.name as string);
    const city = normalizeTitle((r.city as string) ?? "");

    // Le titre de la sortie est presque toujours la commune. On compare aux
    // deux, et on garde la meilleure des deux ressemblances.
    const score = Math.max(
      dice(joined, core.replace(/ /g, "")),
      city ? dice(joined, city.replace(/ /g, "")) : 0
    );

    if (score > (best?.score ?? 0)) {
      best = {
        raceId: r.id as string,
        raceName: r.name as string,
        score,
        metres: Number(r.metres),
      };
    }
  }

  // En dessous, la ressemblance est du hasard : une sortie nommée « Bagnoles »
  // trouverait « Bagnoles-de-l'Orne » et aussi « Banneville ».
  if (!best || best.score < 0.62) return null;
  return best;
}

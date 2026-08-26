import type { SqlLike } from "./types";

/**
 * Ties a Strava ride to the race it was.
 *
 * Two independent signals, tried strongest first:
 *
 *   location — the ride's start point within a few kilometres of the race
 *     venue, on the same day. Unambiguous where both are known.
 *   name — the ride's title against the race's, once category suffixes are
 *     stripped from the race and punctuation from both. Riders name a race ride
 *     after the town ("Mont dol", "Cossé le Vivien"), while the official title
 *     carries a long category tail that would otherwise drown the similarity.
 *
 * Nothing is linked on date alone: a rider trains on race days too, and a wrong
 * link would attribute someone else's result to their ride.
 */

/** Ride titles that say nothing about which race it was. */
const GENERIC_TITLES =
  /^(race|course|training|entrainement|velo|ride|sortie|wahoo|morning|afternoon|evening|matin|midi|soir)/i;

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Riders annotate the outcome in brackets: "(dnf)", "(gruppetto)".
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The race title with its category tail removed.
 *
 * "MONT DOL - ACCESS 2-3-4 H /F" → "mont dol". Without this the rider's short
 * title scores badly against a long official one and a real match is missed.
 */
export function raceTitleCore(value: string): string {
  const stripped = value
    .replace(/\b(open|access|elite|élite|u\d{2})\b[\s\d\-–/+.,]*/gi, " ")
    .replace(/\bh\s*\/?\s*f\b/gi, " ")
    .replace(/['’"«»]/g, " ");
  return normalizeTitle(stripped);
}

export type MatchMethod = "location_and_date" | "name_and_date";

export interface RaceMatch {
  raceId: string;
  raceName: string;
  method: MatchMethod;
  confidence: number;
}

export interface RideForMatching {
  name: string;
  localDate: string;
  lat: number | null;
  lng: number | null;
  /**
   * The rider's own categories. One meeting publishes a race per category, so
   * without this the matcher picks whichever came first and can credit an Open 2
   * rider with the Access field's result.
   */
  categories?: string[];
}

/** Ratio of the shorter title contained in the longer, on whole words. */
function titleOverlap(rideTitle: string, raceCore: string): number {
  if (!rideTitle || !raceCore) return 0;

  const rideWords = rideTitle.split(" ").filter((w) => w.length > 2);
  const raceWords = new Set(raceCore.split(" ").filter((w) => w.length > 2));
  if (rideWords.length === 0 || raceWords.size === 0) return 0;

  const hits = rideWords.filter((w) => raceWords.has(w)).length;
  const wordScore = hits / Math.min(rideWords.length, raceWords.size);

  // Compound place names are spelled both ways: a rider writes "Mont pinchon",
  // the federation writes "Montpinchon". Comparing without spaces catches the
  // pair that word overlap alone misses.
  const rideJoined = rideTitle.replace(/ /g, "");
  const raceJoined = raceCore.replace(/ /g, "");
  const joinedScore =
    rideJoined.length >= 6 &&
    (raceJoined.includes(rideJoined) || rideJoined.includes(raceJoined))
      ? 1
      : 0;

  return Math.max(wordScore, joinedScore);
}

export async function matchRideToRace(
  sql: SqlLike,
  ride: RideForMatching
): Promise<RaceMatch | null> {
  // 1. Location. A race venue is a commune centre and a start line is rarely
  //    more than a few kilometres from it.
  if (ride.lat != null && ride.lng != null) {
    const rows = await sql(
      `SELECT r.id, r.name,
              ST_Distance(r.location, ST_MakePoint($2::float8, $3::float8)::geography) AS metres
         FROM races r
        WHERE r.race_date = $1::date
          AND r.location IS NOT NULL
          AND ST_DWithin(r.location, ST_MakePoint($2::float8, $3::float8)::geography, 15000)
        ORDER BY metres
        LIMIT 4`,
      [ride.localDate, ride.lng, ride.lat]
    );

    if (rows.length > 0) {
      const best = rows[0] as Record<string, unknown>;
      const metres = Number(best.metres);
      return {
        raceId: best.id as string,
        raceName: best.name as string,
        method: "location_and_date",
        confidence: metres < 5000 ? 0.95 : 0.75,
      };
    }
  }

  // 2. Title. Only worth trying when the rider actually named the ride.
  const rideTitle = normalizeTitle(ride.name);
  if (!rideTitle || GENERIC_TITLES.test(ride.name.trim())) return null;

  const candidates = await sql(
    `SELECT id, name, categories FROM races WHERE race_date = $1::date`,
    [ride.localDate]
  );

  let best: { id: string; name: string; score: number } | null = null;
  for (const row of candidates) {
    const r = row as Record<string, unknown>;
    let score = titleOverlap(rideTitle, raceTitleCore(r.name as string));
    if (score === 0) continue;

    // Same town, same day, several category races: the rider's own category
    // decides which one they actually rode.
    if (ride.categories?.length) {
      const raceCategories = (r.categories as string[]) ?? [];
      if (raceCategories.some((c) => ride.categories!.includes(c))) score += 0.2;
    }

    if (score > (best?.score ?? 0)) {
      best = { id: r.id as string, name: r.name as string, score };
    }
  }

  // Below a clear majority of shared words this is coincidence.
  if (!best || best.score < 0.6) return null;

  return {
    raceId: best.id,
    raceName: best.name,
    method: "name_and_date",
    confidence: Math.min(best.score, 1),
  };
}

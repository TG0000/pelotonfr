/**
 * What the organiser says on their own competition page.
 *
 *   npx tsx scripts/scrapers/ffc-briefing.ts [--limit=200] [--force]
 *
 * The nightly calendar scraper reads the list and the map and never opens a
 * competition's page — sixteen hundred detail pages a night is precisely what
 * it was rewritten to stop doing. But those pages carry three things nothing
 * else has: where a dossard is collected, at what time, and now and then the
 * circuit stated outright, "circuit de 7 km à parcourir 11 fois".
 *
 * So it is read separately and selectively, in the order the sector reader uses
 * — a race somebody has in their calendar first, then whoever races soonest.
 * A race's page is read once; organisers fill it in before the event and rarely
 * touch it after.
 *
 * The pickup address is geocoded inside its own commune, which turns "somewhere
 * in Domfront" into "rue du Champ Passais". That point is what the circuit
 * search should be centred on, and it is what a rider needs on the morning.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { fetchHtml, politeDelay } from "./utils/http";
import { parseBriefing } from "../../lib/race-briefing";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BAN = "https://api-adresse.data.gouv.fr/search/";

/**
 * Places an address inside the commune that publishes it.
 *
 * "caravane sono" is not an address and will not resolve, which is the right
 * outcome — a bad point is worse than the commune centroid we already hold.
 * The commune is passed as context so "Mairie" lands in the right village.
 */
async function locate(
  place: string,
  city: string,
  departmentCode: string | null
): Promise<{ lat: number; lng: number; score: number } | null> {
  const params = new URLSearchParams({
    q: `${place} ${city}`,
    limit: "1",
    autocomplete: "0",
  });
  if (departmentCode) params.set("postcode", "");
  if (departmentCode) params.set("citycode", "");

  try {
    const res = await fetch(`${BAN}?${params}`, {
      headers: { "User-Agent": "PelotonFR/1.0 (contact@pelotonfr.fr)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { score: number; city?: string; type?: string };
      }>;
    };
    const best = data.features?.[0];
    if (!best) return null;

    // Below this the geocoder is guessing, and it guesses towards big towns.
    if (best.properties.score < 0.5) return null;

    /* It must have found a place *in* the commune, not the commune itself.
       "PODIUM" and "caravane sono" are not addresses; asked to place them the
       geocoder falls back on the village, hands back a confident score, and we
       would store the centroid we already had while calling it precise. */
    if (!["housenumber", "street", "locality"].includes(best.properties.type ?? "")) {
      return null;
    }
    // It must have landed in the commune we asked about.
    const landed = (best.properties.city ?? "").toLowerCase();
    if (landed && !landed.includes(city.toLowerCase().slice(0, 5))) return null;

    return {
      lng: best.geometry.coordinates[0],
      lat: best.geometry.coordinates[1],
      score: best.properties.score,
    };
  } catch {
    return null;
  }
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;
  const force = process.argv.includes("--force");

  const races = (await sql(
    `SELECT id, name, city, department_code, source_url
       FROM races
      WHERE federation_id = 1
        AND source_url LIKE '%/calendrier/competition/%'
        AND is_cancelled = false
        AND COALESCE(race_date_end, race_date) >= CURRENT_DATE
        AND ($2::boolean OR briefing_fetched_at IS NULL)
      ORDER BY EXISTS (SELECT 1 FROM user_favorites f WHERE f.race_id = races.id) DESC,
               race_date ASC
      LIMIT $1::int`,
    [limit, force]
  )) as Array<Record<string, unknown>>;

  console.log(`${races.length} fiches à lire.\n`);

  let withCircuit = 0;
  let withPlace = 0;
  let located = 0;

  for (const race of races) {
    try {
      const html = await fetchHtml(race.source_url as string);
      const text = cheerio.load(html)("body").text();
      const brief = parseBriefing(text);

      let point: { lat: number; lng: number } | null = null;
      if (brief.bibPickupPlace && race.city) {
        point = await locate(
          brief.bibPickupPlace,
          race.city as string,
          (race.department_code as string) ?? null
        );
      }

      await sql(
        `UPDATE races
            SET bib_pickup_time = $2, bib_pickup_place = $3,
                circuit_m = $4, lap_count = $5,
                start_location = CASE WHEN $6::float8 IS NULL THEN start_location
                                      ELSE ST_MakePoint($6::float8, $7::float8)::geography END,
                briefing_fetched_at = now()
          WHERE id = $1::uuid`,
        [
          race.id,
          brief.bibPickupTime,
          brief.bibPickupPlace?.slice(0, 160) ?? null,
          brief.circuitM,
          brief.lapCount,
          point?.lng ?? null,
          point?.lat ?? null,
        ]
      );

      if (brief.circuitM) withCircuit++;
      if (brief.bibPickupPlace) withPlace++;
      if (point) located++;

      if (brief.circuitM || point) {
        console.log(
          `  ${String(race.name).slice(0, 38).padEnd(40)}` +
            (brief.circuitM
              ? ` ${(brief.circuitM / 1000).toFixed(1)} km${brief.lapCount ? ` × ${brief.lapCount}` : ""}`
              : "") +
            (point ? `  départ situé : ${brief.bibPickupPlace}` : "")
        );
      }
    } catch (err) {
      console.error(
        `  ${String(race.name).slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`
      );
      // Marked read anyway: a page that will not load today will not load
      // tomorrow either, and re-queueing it would starve the ones that would.
      await sql(
        `UPDATE races SET briefing_fetched_at = now() WHERE id = $1::uuid`,
        [race.id]
      );
    }

    await politeDelay(700);
  }

  console.log(
    `\n${withCircuit} circuits annoncés par l'organisateur, ` +
      `${withPlace} lieux de retrait, dont ${located} situés précisément.`
  );

  return {
    seen: races.length,
    written: withPlace,
    metadata: { circuits: withCircuit, located },
  };
}

async function tracked() {
  const run = await startRun(sql, "ffc-briefing");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

import { publicStravaEnabled } from "../../lib/strava/policy";
/**
 * Les circuits reconnus dans l'index des segments traversés.
 *
 *   npx tsx scripts/scrapers/segment-circuits.ts [--limit=200] [--reads=300]
 *
 * L'explorateur de segments est fermé ; l'index des segments que nos coureurs
 * ont traversés le remplace. Pour chaque course à venir sans tracé, les
 * segments qui partent à moins de trois kilomètres du lieu sont candidats ;
 * leur tracé est lu une fois par segments/{id} (une lecture, gardée), et la
 * même reconnaissance que jadis — boucle fermée, centrée sur la commune,
 * nommée comme une course — dit lequel est le circuit.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { getAccessToken } from "../../lib/db/queries/strava";
import { StravaAuthError, StravaRateLimitError } from "../../lib/strava/client";
import { findCircuits } from "../../lib/circuit";
import { trackRun } from "../lib/track-run";
import { storeCircuit } from "./utils/store-circuit";
import { isPointToPoint } from "./utils/point-to-point";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const STRAVA_API = "https://www.strava.com/api/v3";

async function segmentPolyline(token: string, id: number): Promise<string | null> {
  const res = await fetch(`${STRAVA_API}/segments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new StravaRateLimitError("Strava read limit reached.");
  if (res.status === 401 || res.status === 403) throw new StravaAuthError(`Strava refuse segments/${id} (${res.status}).`);
  if (!res.ok) return null;
  const body = (await res.json()) as { map?: { polyline?: string | null } };
  return body.map?.polyline ?? null;
}

async function main() {
  if (!publicStravaEnabled()) { console.log("Collective Strava processing disabled pending authorization."); return; }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;
  const readsArg = process.argv.find((a) => a.startsWith("--reads="));
  let reads = readsArg ? Number(readsArg.split("=")[1]) : 300;

  const [conn] = await sql(`SELECT user_id FROM strava_connections ORDER BY updated_at DESC LIMIT 1`);
  const token = conn ? await getAccessToken(String(conn.user_id)) : null;
  if (!token) { console.log("Aucun compte Strava."); return { seen: 0, written: 0 }; }

  const races = (await sql(
    `SELECT r.id::text, r.name, r.city, r.circuit_m, ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng
       FROM races r LEFT JOIN race_traces t ON t.race_id = r.id
      WHERE t.race_id IS NULL AND r.location IS NOT NULL AND r.discipline = 'route'
        AND r.race_date >= CURRENT_DATE AND r.race_date <= CURRENT_DATE + 120
        AND EXISTS (SELECT 1 FROM strava_segments s WHERE s.distance_m BETWEEN 1500 AND 30000
                      AND ST_DWithin(s.start, r.location, 6000))
      ORDER BY r.race_date
      LIMIT $1::int`,
    [limit]
  )) as Array<Record<string, unknown>>;
  console.log(`${races.length} courses à venir sans tracé avec des segments connus à côté.`);

  let found = 0;
  for (const race of races) {
    if (await isPointToPoint(sql, String(race.name))) continue;
    const candidates = (await sql(
      /* Un segment déjà interrogé et rendu sans tracé — privé, supprimé — a
         un polyline vide et pas nul : le relire chaque nuit brûlait une
         lecture Strava par segment mort, jusqu'à épuiser le budget avant les
         courses suivantes. `detail_at` dit qu'on a déjà demandé. */
      `SELECT id, name, polyline, distance_m FROM strava_segments
        WHERE distance_m BETWEEN 1500 AND 30000 AND ST_DWithin(start, ST_MakePoint($1::float8, $2::float8)::geography, 6000)
          AND (polyline <> '' OR detail_at IS NULL)
        ORDER BY crossings DESC, distance_m DESC LIMIT 40`,
      [race.lng, race.lat]
    )) as Array<Record<string, unknown>>;
    const segs: Array<{ id: number; name: string; points: string | null }> = [];
    try {
      for (const c of candidates) {
        let poly = c.polyline as string | null;
        if (!poly) {
          if (reads <= 0) break;
          reads--;
          poly = await segmentPolyline(token, Number(c.id));
          await sql(`UPDATE strava_segments SET polyline = $2, detail_at = now() WHERE id = $1::bigint`, [c.id, poly ?? ""]);
          await new Promise((r) => setTimeout(r, 250));
        }
        if (poly) segs.push({ id: Number(c.id), name: String(c.name), points: poly });
      }
    } catch (err) {
      if (err instanceof StravaAuthError || err instanceof StravaRateLimitError) { console.log(`\n${err.message} Arrêt.`); break; }
      throw err;
    }
    const circuit = findCircuits(segs, {
      lat: Number(race.lat), lng: Number(race.lng), city: (race.city as string) ?? null,
      expectedLapM: race.circuit_m != null ? Number(race.circuit_m) : null,
    })[0];
    if (!circuit) continue;
    if (await storeCircuit(sql, String(race.id), circuit)) {
      found++;
      console.log(`  ✓ ${String(race.name).slice(0, 46).padEnd(48)} « ${circuit.name} » ${(circuit.lengthM / 1000).toFixed(1)} km, centre à ${Math.round(circuit.proximityM)} m`);
    }
  }
  console.log(`\n${found} circuit(s) reconnu(s), ${reads} lecture(s) restantes.`);
  return { seen: races.length, written: found };
}

trackRun(sql, "segment-circuits", main);

/**
 * La météo des sept prochains jours, une course à la fois.
 *
 *   npx tsx scripts/scrapers/forecast.ts [--limit=600]
 *
 * Open-Meteo répond en une requête par point ; six cents courses, c'est deux
 * minutes. On garde ce qu'un coureur regarde le jeudi soir : vent et rafales
 * au départ, probabilité de pluie, température.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { getRaceWeather } from "../../lib/weather";
import { trackRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 600;

  const races = (await sql(
    `SELECT r.id::text, r.race_date::text,
            ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
            -- L'heure annoncée quand on l'a (« 14h30 »), sinon le début d'après-midi.
            COALESCE(NULLIF(substring(r.start_time FROM '^\\s*(\\d{1,2})'), '')::int, 14) AS start_hour
       FROM races r
      WHERE r.race_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        AND r.is_cancelled = false AND r.location IS NOT NULL
      ORDER BY r.race_date
      LIMIT $1::int`,
    [limit]
  )) as Array<{ id: string; race_date: string; lat: number; lng: number; start_hour: number }>;

  console.log(`${races.length} courses à prévoir.`);
  let written = 0;
  for (const r of races) {
    try {
      const w = await getRaceWeather(Number(r.lat), Number(r.lng), r.race_date, {
        startHour: Math.min(Math.max(r.start_hour, 6), 20),
        durationMinutes: 150,
        measured: false,
      });
      if (!w) continue;
      await sql(
        `INSERT INTO race_forecast (race_id, for_date, wind_kmh, gust_kmh, wind_from_deg, rain_pct, temp_c, fetched_at)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, now())
         ON CONFLICT (race_id) DO UPDATE SET for_date = EXCLUDED.for_date, wind_kmh = EXCLUDED.wind_kmh,
           gust_kmh = EXCLUDED.gust_kmh, wind_from_deg = EXCLUDED.wind_from_deg, rain_pct = EXCLUDED.rain_pct,
           temp_c = EXCLUDED.temp_c, fetched_at = now()`,
        [
          r.id, r.race_date,
          w.atStart.windKmh, w.peakGustKmh ?? w.atStart.gustKmh, w.atStart.windDirectionDeg,
          Math.round(w.atStart.precipitationProbability), w.atStart.temperatureC,
        ]
      );
      written++;
    } catch (err) {
      console.error(`  ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${written} prévisions gardées.`);
  return { seen: races.length, written };
}

trackRun(sql, "forecast", main);

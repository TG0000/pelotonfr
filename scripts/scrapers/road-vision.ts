/**
 * Lire la route sur les photos Panoramax des circuits à venir.
 *
 *   npx tsx scripts/scrapers/road-vision.ts [--limit=30] [--race=<uuid>]
 *
 * Pour chaque course tracée à venir, jusqu'à six photos prises sur la boucle,
 * les plus récentes, une tous les quelques centaines de mètres. Chaque photo
 * est lue UNE SEULE FOIS (road_views, clé sur l'identifiant Panoramax).
 * --limit plafonne le nombre de photos lues par passage.
 */
import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { findRoadPictures } from "../../lib/panoramax";
import { findMapillaryPictures, mapillaryConfigured } from "../../lib/mapillary";
import { detectLaps } from "../../lib/trace";
import { readRoadPicture } from "../../lib/road-vision";
import { orientPicture } from "../../lib/road-picture";
import sharp from "sharp";

/** La vignette gardée en base : 900 px de large, assez pour lire la route. */
async function shrink(bytes: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(bytes)).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
}
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));
const MODEL = "claude-sonnet-5";
const PER_RACE = 6;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("ANTHROPIC_API_KEY absente : rien à faire.");
    return { seen: 0, written: 0 };
  }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 30;
  const raceArg = process.argv.find((a) => a.startsWith("--race="));
  const onlyRace = raceArg ? raceArg.split("=")[1] : null;

  const races = (await sql(
    `SELECT t.race_id::text AS race_id, r.name, t.points
       FROM race_traces t JOIN races r ON r.id = t.race_id
      WHERE ($1::uuid IS NULL OR t.race_id = $1::uuid)
        AND ($1::uuid IS NOT NULL OR r.race_date >= CURRENT_DATE)
      ORDER BY r.race_date`,
    [onlyRace]
  )) as Array<Record<string, unknown>>;

  let read = 0, tokensIn = 0, tokensOut = 0, seen = 0;
  for (const race of races) {
    if (read >= limit) break;
    const [{ n }] = (await sql(`SELECT count(*) AS n FROM road_views WHERE race_id = $1::uuid`, [race.race_id])) as Array<{ n: string }>;
    if (Number(n) >= PER_RACE) continue;
    const track = race.points as Array<[number, number, number, number]>;
    let pics = await findRoadPictures(track, PER_RACE);
    // Panoramax d'abord ; Mapillary quand il n'y a presque rien (Louvigné : une photo).
    if (pics.length < 3 && mapillaryConfigured()) {
      const lap = detectLaps(track).lap ?? track;
      const lngs = lap.map((p) => p[0]); const lats = lap.map((p) => p[1]);
      const more = await findMapillaryPictures(lap, { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) }, PER_RACE - pics.length);
      pics = [...pics, ...more];
    }
    seen += pics.length;
    for (const p of pics) {
      if (read >= limit) break;
      const [exists] = await sql(`SELECT 1 FROM road_views WHERE picture_id = $1`, [p.id]);
      if (exists) continue;
      try {
        const res = await fetch(p.url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`image ${res.status}`);
        const raw = new Uint8Array(await res.arrayBuffer());
        // Une sphérique est recadrée dans le sens de la course avant lecture :
        // la gauche de l'image devient la gauche du coureur.
        const { bytes, orientation } = await orientPicture(raw, p);
        const out = await readRoadPicture(bytes, apiKey, MODEL);
        if (!out) throw new Error("pas de lecture");
        tokensIn += out.inputTokens; tokensOut += out.outputTokens; read++;
        await sql(
          `INSERT INTO road_views (picture_id, race_id, along_m, taken_on, url, producer, ok, reading, model, input_tokens, output_tokens, bearing, orientation, crop, lat, lng)
           VALUES ($1, $2::uuid, $3::int, $4::date, $5, $6, $7::boolean, $8::jsonb, $9, $10::int, $11::int, $12::smallint, $13, $14::bytea, $15::float8, $16::float8)
           ON CONFLICT (picture_id) DO NOTHING`,
          [p.id, race.race_id, Math.round(p.alongM), p.takenOn || null, p.url, p.producer, out.reading !== null, out.reading ? JSON.stringify(out.reading) : null, MODEL, out.inputTokens, out.outputTokens, p.bearing, orientation, await shrink(bytes), p.lat, p.lng]
        );
        const r = out.reading;
        console.log(`  ${String(race.name).slice(0, 28).padEnd(30)} km ${(p.alongM / 1000).toFixed(1)}  ${orientation} ${r ? `${r.surface}, ${r.condition}${r.looseGravel ? ", gravillons" : ""} · G ${r.coverLeft ?? "?"} / D ${r.coverRight ?? "?"}${r.note ? ` — ${r.note}` : ""}` : "illisible"}`);
      } catch (err) {
        console.error(`  ${String(race.name).slice(0, 28)} : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  const cost = (tokensIn * 3 + tokensOut * 15) / 1_000_000;
  console.log(`\n${read} photos lues sur ${seen} trouvées, environ ${cost.toFixed(2)} $. Elles ne seront plus relues.`);
  return { seen, written: read, metadata: { tokensIn, tokensOut } };
}

async function tracked() {
  const run = await startRun(sql, "road-vision");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}
tracked();

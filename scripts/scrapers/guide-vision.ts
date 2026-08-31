/**
 * Lire les guides techniques avec la vision.
 *
 *   npx tsx scripts/scrapers/guide-vision.ts [--limit=20] [--race=<uuid>]
 *
 * Une page de guide est un scan qui ne changera plus. Elle est donc lue UNE
 * SEULE FOIS : la lecture est rangée dans guide_pages, clé sur l'URL de
 * l'image, et plus rien ne la relit — pas même une lecture ratée, qui laisse sa
 * ligne pour ne pas être retentée en boucle.
 *
 * Il n'y a ni reprise automatique ni file d'attente qui se remplit toute seule.
 * Le nombre de pages lues est plafonné par --limit, et le script dit ce qu'il
 * a dépensé.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "./utils/db";
import { readGuidePage } from "../../lib/guide-page";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const MODEL = "claude-sonnet-5";

/** Tarif au million de jetons, pour dire le coût en clair à la fin. */
const PRICE_IN = 3;
const PRICE_OUT = 15;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("ANTHROPIC_API_KEY absente : rien à faire.");
    return { seen: 0, written: 0 };
  }

  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 20;
  const raceArg = process.argv.find((a) => a.startsWith("--race="));
  const onlyRace = raceArg ? raceArg.split("=")[1] : null;

  /* Chaque page du guide devient une ligne à lire, sauf celles déjà lues.
     jsonb_array_elements garde l'ordre, donc l'ordinalité est le numéro de
     page. */
  const pages = (await sql(
    `SELECT g.race_id::text AS race_id, r.name,
            p.url::text AS url, p.n AS page_number
       FROM race_guides g
       JOIN races r ON r.id = g.race_id
       CROSS JOIN LATERAL jsonb_array_elements_text(g.page_urls)
                          WITH ORDINALITY AS p(url, n)
      WHERE ($2::uuid IS NULL OR g.race_id = $2::uuid)
        AND NOT EXISTS (SELECT 1 FROM guide_pages gp WHERE gp.page_url = p.url)
      ORDER BY r.race_date, p.n
      LIMIT $1::int`,
    [limit, onlyRace]
  )) as Array<Record<string, unknown>>;

  console.log(`${pages.length} pages jamais lues.\n`);

  let read = 0;
  let itineraries = 0;
  let points = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const page of pages) {
    const url = page.url as string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`image ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());

      const out = await readGuidePage(bytes, "image/jpeg", apiKey, MODEL);
      if (!out) throw new Error("pas de lecture");

      tokensIn += out.cost.inputTokens;
      tokensOut += out.cost.outputTokens;
      read++;

      const reading = out.reading;
      if (reading?.kind === "itineraire" && reading.points.length > 0) {
        itineraries++;
        points += reading.points.length;
      }

      await sql(
        `INSERT INTO guide_pages
           (page_url, race_id, page_number, ok, kind, stage_number,
            points, confidence, model, input_tokens, output_tokens)
         VALUES ($1, $2::uuid, $3::int, $4::boolean, $5, $6::int,
                 $7::jsonb, $8::real, $9, $10::int, $11::int)
         ON CONFLICT (page_url) DO NOTHING`,
        [
          url,
          page.race_id,
          page.page_number,
          reading !== null,
          reading?.kind ?? null,
          reading?.stageNumber ?? null,
          JSON.stringify(reading?.points ?? []),
          reading?.confidence ?? null,
          MODEL,
          out.cost.inputTokens,
          out.cost.outputTokens,
        ]
      );

      console.log(
        `  p.${String(page.page_number).padStart(2)} ${String(page.name).slice(0, 30).padEnd(32)}` +
          ` ${(reading?.kind ?? "illisible").padEnd(11)}` +
          (reading?.points.length ? ` ${reading.points.length} points` : "")
      );
    } catch (err) {
      /* La page reste non lue : une image qui ne se télécharge pas n'a rien
         coûté, et rien n'a été appris qu'il faille figer. */
      console.error(
        `  p.${page.page_number} ${String(page.name).slice(0, 30)}: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const cost = (tokensIn * PRICE_IN + tokensOut * PRICE_OUT) / 1_000_000;
  console.log(
    `\n${read} pages lues, dont ${itineraries} itinéraires ` +
      `(${points} points de passage).\n` +
      `Coût : ${tokensIn} jetons en entrée, ${tokensOut} en sortie, ` +
      `soit environ ${cost.toFixed(2)} $. Ces pages ne seront plus jamais relues.`
  );

  return {
    seen: pages.length,
    written: read,
    metadata: { itineraries, points, tokensIn, tokensOut },
  };
}

async function tracked() {
  const run = await startRun(sql, "guide-vision");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

tracked();

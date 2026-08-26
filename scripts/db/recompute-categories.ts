/**
 * Recomputes every race's categories through the canonical vocabulary.
 *
 *   npx tsx scripts/db/recompute-categories.ts [--dry-run]
 *
 * Categories were stored in whatever wording each source used — "Open3" on a
 * race, "Open 3" on a rider, "Cadets" here and "U17" there — so no comparison
 * between the two ever matched. This rewrites races through
 * `normalizeCategories`, which also fixes what the wording lost: a race titled
 * "U7 à U13" covers U9 and U11, and storing only its endpoints dropped them.
 *
 * FFC races carry their categories in the title, so the title is the source of
 * truth for them and re-deriving is lossless. Races with no categories in their
 * name keep whatever they have.
 */

import { loadEnv, requireEnv } from "../lib/load-env";
import { createSql } from "../scrapers/utils/db";
import { normalizeCategories } from "../../lib/categories";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const FED_SLUG: Record<number, string> = { 1: "ffc", 2: "fsgt", 3: "ufolep" };

interface Row {
  id: string;
  name: string;
  federation_id: number;
  categories: string[];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const rows = (await sql(
    `SELECT id, name, federation_id, categories FROM races ORDER BY race_date DESC`
  )) as unknown as Row[];

  console.log(`${rows.length} races to review.`);

  let rewritten = 0;
  let cleared = 0;
  let untouched = 0;
  const samples: string[] = [];

  for (const row of rows) {
    // Only the FFC puts categories in the title; for the others the title is
    // just a town name and re-deriving would wipe what the department pages
    // supplied.
    const derived =
      row.federation_id === 1
        ? normalizeCategories(row.name, FED_SLUG[row.federation_id])
        : [];

    const current = row.categories ?? [];

    // Anything already canonical is left alone.
    const currentCanonical =
      current.length > 0 &&
      current.every((c) => c === c.toLowerCase() && !c.includes(" "));

    if (derived.length === 0) {
      if (currentCanonical || current.length === 0) {
        untouched++;
        continue;
      }
      // Legacy wording with nothing to re-derive from: normalise in place.
      const remapped = normalizeCategories(
        current.join(" "),
        FED_SLUG[row.federation_id]
      );
      if (remapped.length === 0) {
        if (!dryRun) {
          await sql(`UPDATE races SET categories = '{}' WHERE id = $1::uuid`, [row.id]);
        }
        cleared++;
        continue;
      }
      if (!dryRun) {
        await sql(`UPDATE races SET categories = $2::text[] WHERE id = $1::uuid`, [
          row.id,
          remapped,
        ]);
      }
      rewritten++;
      continue;
    }

    const same =
      derived.length === current.length &&
      derived.every((c) => current.includes(c));
    if (same) {
      untouched++;
      continue;
    }

    if (samples.length < 8) {
      samples.push(
        `  ${row.name.slice(0, 46).padEnd(48)} ${JSON.stringify(current).slice(0, 30)} → ${JSON.stringify(derived)}`
      );
    }

    if (!dryRun) {
      await sql(`UPDATE races SET categories = $2::text[] WHERE id = $1::uuid`, [
        row.id,
        derived,
      ]);
    }
    rewritten++;
  }

  if (samples.length > 0) {
    console.log("\nexemples :");
    samples.forEach((s) => console.log(s));
  }

  console.log(
    `\n${rewritten} rewritten, ${cleared} cleared, ${untouched} unchanged.`
  );

  if (!dryRun) {
    const dist = await sql(
      `SELECT unnest(categories) c, COUNT(*) n FROM races WHERE is_active
        GROUP BY 1 ORDER BY 2 DESC LIMIT 14`
    );
    console.log("\nvocabulaire final :");
    dist.forEach((d) => {
      const r = d as Record<string, unknown>;
      console.log(`  ${String(r.c).padEnd(12)} ${r.n}`);
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

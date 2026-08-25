/**
 * Migration runner.
 *
 *   npx tsx scripts/db/migrate.ts            # apply every pending migration
 *   npx tsx scripts/db/migrate.ts --dry-run  # list what would run
 *
 * Applied migrations are recorded in `schema_migrations`, so re-running is safe.
 * Statements are executed one at a time because the Neon HTTP driver does not
 * accept multi-statement strings.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "../lib/load-env";

loadEnv();

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "db",
  "migrations"
);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const _neon = neon(DATABASE_URL);
const sql = (query: string, params: unknown[] = []) =>
  _neon.query(query, params) as Promise<Record<string, unknown>[]>;

/**
 * Split a SQL file into individual statements.
 * Aware of single quotes, dollar-quoted blocks ($$ ... $$ / $tag$ ... $tag$)
 * and line comments, so semicolons inside them do not split a statement.
 */
function splitStatements(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (inSingle) {
      current += ch;
      // '' is an escaped quote inside a string literal
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      current += ch + next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      i++;
      continue;
    }
    const dollarMatch = /^\$[A-Za-z_]*\$/.exec(source.slice(i));
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

/** A statement is only comments / whitespace — nothing to send. */
function isNoop(statement: string): boolean {
  const stripped = statement
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  return stripped.length === 0;
}

async function ensureMigrationsTable() {
  await sql(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      duration_ms INTEGER
    )
  `);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  await ensureMigrationsTable();

  const applied = new Map<string, string>();
  for (const row of await sql(`SELECT filename, checksum FROM schema_migrations`)) {
    applied.set(row.filename as string, row.checksum as string);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  let ran = 0;

  for (const filename of files) {
    const source = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        console.warn(
          `~ ${filename} already applied but its contents changed since. ` +
            `Add a new migration rather than editing this one.`
        );
      } else {
        console.log(`= ${filename} (already applied)`);
      }
      continue;
    }

    const statements = splitStatements(source).filter((s) => !isNoop(s));

    if (dryRun) {
      console.log(`+ ${filename} — ${statements.length} statements (dry run)`);
      ran++;
      continue;
    }

    console.log(`+ ${filename} — running ${statements.length} statements...`);
    const started = Date.now();

    for (let idx = 0; idx < statements.length; idx++) {
      try {
        await sql(statements[idx]);
      } catch (err) {
        const preview = statements[idx].replace(/\s+/g, " ").slice(0, 160);
        console.error(`\n  statement ${idx + 1}/${statements.length} failed:`);
        console.error(`  ${preview}`);
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    const durationMs = Date.now() - started;
    await sql(
      `INSERT INTO schema_migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3)`,
      [filename, checksum, durationMs]
    );
    console.log(`  done in ${durationMs}ms`);
    ran++;
  }

  console.log(
    dryRun
      ? `\n${ran} migration(s) pending.`
      : `\n${ran} migration(s) applied.`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

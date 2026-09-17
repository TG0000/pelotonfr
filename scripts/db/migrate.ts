/** Transactional migrations. --dry-run opens a read-only transaction and writes nothing. */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { loadEnv } from "../lib/load-env";
import { databaseConnectionString } from "../../lib/db/transaction";

loadEnv();
const directory = join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const dryRun = process.argv.includes("--dry-run");
  const client = new Client({ connectionString: databaseConnectionString(), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    // Transaction-scoped lock also works through a transaction-mode connection pool.
    await client.query(dryRun ? "BEGIN READ ONLY" : "BEGIN");
    if (!dryRun) await client.query("SELECT pg_advisory_xact_lock(72400302)");
    const { rows: tables } = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    const applied = new Map<string, string>();
    if (tables[0].name) {
      const { rows } = await client.query("SELECT filename, checksum FROM schema_migrations");
      for (const row of rows) applied.set(row.filename, row.checksum);
    }
    const files = readdirSync(directory).filter((file) => file.endsWith(".sql")).sort().map((filename) => {
      const source = readFileSync(join(directory, filename), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      if (applied.has(filename) && applied.get(filename) !== checksum) {
        throw new Error(`CHECKSUM_MISMATCH: ${filename}; restore the applied file and add a new migration`);
      }
      return { filename, source, checksum };
    });
    // Verify every checksum before the first write.
    if (!dryRun) await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename varchar(255) PRIMARY KEY, checksum varchar(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), duration_ms integer)`);
    for (const file of files) {
      if (applied.has(file.filename)) continue;
      if (dryRun) { console.log(`PENDING ${file.filename}`); continue; }
      const started = Date.now();
      try {
        // pg supports the entire SQL file, including quoted blocks and functions.
        await client.query(file.source);
        await client.query("INSERT INTO schema_migrations(filename, checksum, duration_ms) VALUES ($1,$2,$3)",
          [file.filename, file.checksum, Date.now() - started]);
        console.log(`PREPARED ${file.filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
        throw new Error(`MIGRATION_FAILED ${file.filename} (${code}); rolled back`);
      }
    }
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    console.log(dryRun ? "Read-only inspection complete." : "All pending migrations committed.");
  } finally {
    await client.end();
  }
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });

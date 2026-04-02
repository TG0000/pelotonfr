import { neon } from "@neondatabase/serverless";

type SqlFn = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

let _sql: SqlFn | null = null;

function getSql(): SqlFn {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "Add it to .env.local for local development."
    );
  }
  _sql = neon(process.env.DATABASE_URL) as unknown as SqlFn;
  return _sql;
}

// Exported as a function call so the DB URL is only read at query time,
// not at module-evaluation time (avoids build-time errors in CI/Vercel without .env).
export const sql: SqlFn = (query, params) => getSql()(query, params);

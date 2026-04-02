import { neon } from "@neondatabase/serverless";

type SqlFn = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

let _sqlFn: SqlFn | null = null;

function getSql(): SqlFn {
  if (_sqlFn) return _sqlFn;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "Add it to .env.local for local development."
    );
  }
  const _neon = neon(process.env.DATABASE_URL);
  _sqlFn = (query: string, params?: unknown[]) =>
    _neon.query(query, params ?? []) as Promise<Record<string, unknown>[]>;
  return _sqlFn;
}

// Exported as a function call so the DB URL is only read at query time,
// not at module-evaluation time (avoids build-time errors in CI/Vercel without .env).
export const sql: SqlFn = (query, params) => getSql()(query, params);

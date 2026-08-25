/**
 * Database access for scripts.
 *
 * The app uses `lib/db` (which reads DATABASE_URL lazily at query time);
 * scripts need an explicit connection they can pass around, so they build one
 * here and thread it through the pipeline rather than reaching for a global.
 */

import { neon } from "@neondatabase/serverless";

export type SqlFn = (
  query: string,
  params?: unknown[]
) => Promise<Record<string, unknown>[]>;

export function createSql(databaseUrl: string): SqlFn {
  const client = neon(databaseUrl);
  return (query, params) =>
    client.query(query, params ?? []) as Promise<Record<string, unknown>[]>;
}

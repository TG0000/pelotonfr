import { Pool, type PoolClient } from "pg";

/** Keep the server certificate check enabled, including after pg upgrades. */
export function databaseConnectionString(value = process.env.DATABASE_URL): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.delete("uselibpqcompat");
  }
  return url.toString();
}

export const databasePool = new Pool({
  connectionString: databaseConnectionString(),
  max: 3,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 20_000,
});

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

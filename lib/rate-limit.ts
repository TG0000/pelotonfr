import { getDatabasePool } from "@/lib/db/transaction";

/** A shared fixed-window counter; the database clock and upsert make it atomic. */
export async function consumeLimit(key: string, maximum: number, seconds: number): Promise<boolean> {
  const { rows } = await getDatabasePool().query(`INSERT INTO request_limits(key,count,expires_at)
    VALUES ($1,1,now()+make_interval(secs=>$3))
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN request_limits.expires_at <= now() THEN 1 ELSE request_limits.count + 1 END,
      expires_at = CASE WHEN request_limits.expires_at <= now() THEN now()+make_interval(secs=>$3) ELSE request_limits.expires_at END
    WHERE request_limits.expires_at <= now() OR request_limits.count < $2
    RETURNING key`, [key, maximum, seconds]);
  return rows.length === 1;
}

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const results: Record<string, unknown> = { today };

  // Test 1: simple count
  try {
    const rows = await sql(
      `SELECT COUNT(*) FILTER (WHERE is_active AND race_date >= CURRENT_DATE) AS upcoming FROM races`
    );
    results.simple_count = Number((rows[0] as { upcoming: string }).upcoming);
  } catch (err) {
    results.simple_count_error = String(err);
  }

  // Test 2: same query as getRaces
  try {
    const rows = await sql(
      `SELECT COUNT(*) AS total
       FROM races r
       JOIN federations f ON f.id = r.federation_id
       WHERE r.is_cancelled = false AND r.is_active = true AND r.race_date >= $1::date`,
      [today]
    );
    results.races_count = Number((rows[0] as { total: string }).total);
  } catch (err) {
    results.races_count_error = String(err);
  }

  // Test 3: first page of races
  try {
    const rows = await sql(
      `SELECT r.id, r.name, r.race_date, f.slug AS federation_slug
       FROM races r
       JOIN federations f ON f.id = r.federation_id
       WHERE r.is_cancelled = false AND r.is_active = true AND r.race_date >= $1::date
       ORDER BY r.race_date ASC
       LIMIT 3`,
      [today]
    );
    results.first_races = rows;
  } catch (err) {
    results.first_races_error = String(err);
  }

  return NextResponse.json(results);
}

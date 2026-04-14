import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sql(
      `SELECT COUNT(*) FILTER (WHERE is_active AND race_date >= CURRENT_DATE) AS upcoming FROM races`
    );
    const upcoming = (rows[0] as { upcoming: string }).upcoming;
    return NextResponse.json({ ok: true, upcoming: Number(upcoming) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

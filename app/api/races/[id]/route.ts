import { NextRequest, NextResponse } from "next/server";
import { getRaceById } from "@/lib/db/queries/races";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id?.match(/^[0-9a-f-]{36}$/i)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const race = await getRaceById(id);
    if (!race) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(race, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("GET /api/races/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

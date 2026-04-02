import { NextRequest, NextResponse } from "next/server";
import { geocodeSearch } from "@/lib/geocoding";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (!q.trim() || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const results = await geocodeSearch(q);
    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "public, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("GET /api/geocode error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

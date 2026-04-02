import { NextRequest, NextResponse } from "next/server";
import { getRaces, getRacesForMap } from "@/lib/db/queries/races";
import type { RaceFilters } from "@/types";
import type { FederationSlug, Discipline } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filters: Partial<RaceFilters> = {
    fed: searchParams.getAll("fed") as FederationSlug[],
    disc: searchParams.getAll("disc") as Discipline[],
    cat: searchParams.getAll("cat"),
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    q: searchParams.get("q") ?? "",
    page: Number(searchParams.get("page")) || 1,
    lat: searchParams.has("lat") ? Number(searchParams.get("lat")) : null,
    lng: searchParams.has("lng") ? Number(searchParams.get("lng")) : null,
    radius: Number(searchParams.get("radius")) || 50,
  };

  const forMap = searchParams.get("format") === "map";

  try {
    if (forMap) {
      const races = await getRacesForMap(filters);
      return NextResponse.json({ races });
    }

    const result = await getRaces(filters);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("GET /api/races error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

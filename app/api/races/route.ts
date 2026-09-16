import { NextRequest, NextResponse } from "next/server";
import { getRaces, getRacesForMap } from "@/lib/db/queries/races";
import type { RaceFilters } from "@/types";
import type { FederationSlug, Discipline } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const numeric=(name:string,min:number,max:number)=>{const raw=searchParams.get(name);return raw===null || (raw.trim()!=="" && Number.isFinite(Number(raw)) && Number(raw)>=min && Number(raw)<=max);};
  const validDate=(value:string|null)=>value===null || /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!numeric("lat",-90,90)||!numeric("lng",-180,180)||!numeric("radius",1,500)||!numeric("page",1,10000)||!validDate(searchParams.get("dateFrom"))||!validDate(searchParams.get("dateTo"))||(searchParams.get("q")?.length??0)>160||["fed","disc","cat"].some(key=>searchParams.getAll(key).length>40))return NextResponse.json({error:"Filtres invalides."},{status:400});
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
      return NextResponse.json({ races, limited: races.length>=2000, limit:2000 });
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

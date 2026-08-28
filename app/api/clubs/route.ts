import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchClubs } from "@/lib/db/queries/club";

/** Les clubs qui ressemblent à ce qu'on cherche. Réservé aux personnes
 *  connectées : c'est un annuaire de structures, pas une page publique. */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json([], { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await searchClubs(q));
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

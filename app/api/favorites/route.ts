import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserFavoriteIds, addFavorite, getOrCreateUser } from "@/lib/db/queries/favorites";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ids = await getUserFavoriteIds(userId);
    return NextResponse.json({ favoriteIds: ids });
  } catch (err) {
    console.error("GET /api/favorites error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { raceId?: string };
  if (!body.raceId) {
    return NextResponse.json({ error: "raceId is required" }, { status: 400 });
  }

  try {
    await addFavorite(userId, body.raceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/favorites error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

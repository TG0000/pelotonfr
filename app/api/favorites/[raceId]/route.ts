import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { removeFavorite } from "@/lib/db/queries/favorites";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ raceId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { raceId } = await params;

  try {
    await removeFavorite(userId, raceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/favorites/[raceId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

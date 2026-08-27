import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/db/queries/alerts";
import { searchRiders, claimRider, releaseRider } from "@/lib/db/queries/my-season";

/**
 * Tying an account to a rider in the federation's files.
 *
 * Done by search rather than by asking for a UCI number, because a rider knows
 * their own name and almost never their licence number by heart.
 */

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ riders: await searchRiders(q) });
  } catch (err) {
    console.error("GET /api/me/rider:", err);
    return NextResponse.json({ riders: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { riderId?: string };
  if (!body.riderId) {
    return NextResponse.json({ error: "riderId manquant" }, { status: 400 });
  }

  try {
    const user = await currentUser();
    const id = await resolveUser(
      userId,
      user?.primaryEmailAddress?.emailAddress ?? null
    );
    await claimRider(id, body.riderId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/me/rider:", err);
    return NextResponse.json({ error: "Échec du rattachement" }, { status: 500 });
  }
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = await resolveUser(userId);
    await releaseRider(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/me/rider:", err);
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}

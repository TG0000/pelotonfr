import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getConnection, disconnect } from "@/lib/db/queries/strava";
import { authorizeUrl, stravaConfigured } from "@/lib/strava/client";

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/api/strava/callback`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!stravaConfigured()) {
    return NextResponse.json({ configured: false, connection: null });
  }

  const user = await currentUser();
  const id = await resolveUser(userId, user?.primaryEmailAddress?.emailAddress ?? null);
  const connection = await getConnection(id);

  return NextResponse.json({
    configured: true,
    connection,
    // The Clerk id is carried through OAuth as `state` and checked on return,
    // which is what stops another site initiating the connection.
    authorizeUrl: connection ? null : authorizeUrl(redirectUri(), userId),
  });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = await resolveUser(userId);
  await disconnect(id);
  return NextResponse.json({ success: true });
}

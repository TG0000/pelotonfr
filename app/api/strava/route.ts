import { mutationOriginAllowed } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getConnection, disconnect, StravaDisconnectError } from "@/lib/db/queries/strava";
import { stravaConfigured } from "@/lib/strava/client";

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
    authorizeUrl: null, // Linking uses Better Auth and its one-time OAuth state.
  });
}

export async function DELETE(request: Request) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = await resolveUser(userId);
  try {
    await disconnect(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof StravaDisconnectError ? error.message : "La déconnexion a échoué. Réessaie dans un instant." }, { status: error instanceof StravaDisconnectError ? 409 : 503 });
  }
}

import { NextResponse } from "next/server";

/** Retired legacy callback. The only OAuth callback is now managed by Better Auth. */
export async function GET() {
  return NextResponse.json({ error: "Ce lien Strava a expiré. Recommence la connexion depuis ton profil." }, { status: 410 });
}

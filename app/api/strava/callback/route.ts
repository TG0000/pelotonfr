import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";
import { auth } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/db/queries/alerts";
import { saveConnection, saveFitness } from "@/lib/db/queries/strava";
import {
  exchangeCode,
  getAthleteSummary,
  STRAVA_SCOPES,
} from "@/lib/strava/client";

/**
 * Strava's OAuth return.
 *
 * `state` carries the Clerk id that started the flow and is compared to the
 * session here: without that check, a link crafted elsewhere could attach an
 * attacker's Strava account to whoever clicked it.
 */
export async function GET(request: NextRequest) {
  const base = await getSiteUrl();
  const params = request.nextUrl.searchParams;

  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/profil?strava=${reason}`);

  if (params.get("error")) return fail("refus");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("incomplet");

  const { userId } = await auth();
  if (!userId || userId !== state) return fail("session");

  try {
    const tokens = await exchangeCode(code);
    const id = await resolveUser(userId);

    await saveConnection({
      userId: id,
      athleteId: tokens.athleteId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: STRAVA_SCOPES,
      athleteName: tokens.athleteName,
      homeCity: tokens.homeCity,
    });

    const summary = await getAthleteSummary(tokens.accessToken);
    await saveFitness(id, summary.ftp, summary.weightKg);

    return NextResponse.redirect(`${base}/profil?strava=ok`);
  } catch (err) {
    console.error("Strava callback:", err);
    return fail("erreur");
  }
}

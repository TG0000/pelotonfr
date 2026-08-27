import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/db/queries/alerts";
import {
  getPlanIntents,
  setIntent,
  clearIntent,
  type RaceIntent,
} from "@/lib/db/queries/plan";

/** The rider's calendar: what they are weighing up, and what they are riding. */

const VALID: RaceIntent[] = ["envisagee", "programmee"];

async function me(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return resolveUser(userId, user?.primaryEmailAddress?.emailAddress ?? null);
}

export async function GET() {
  const id = await me();
  if (!id) return NextResponse.json({ intents: {} });

  try {
    const map = await getPlanIntents(id);
    return NextResponse.json({ intents: Object.fromEntries(map) });
  } catch (err) {
    console.error("GET /api/plan:", err);
    return NextResponse.json({ intents: {} }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const id = await me();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    raceId?: string;
    intent?: string | null;
  };
  if (!body.raceId) {
    return NextResponse.json({ error: "raceId manquant" }, { status: 400 });
  }

  try {
    // A null intent means the rider took it off the calendar entirely, which
    // is a different act from downgrading it.
    if (body.intent === null || body.intent === undefined) {
      await clearIntent(id, body.raceId);
    } else if (VALID.includes(body.intent as RaceIntent)) {
      await setIntent(id, body.raceId, body.intent as RaceIntent);
    } else {
      return NextResponse.json({ error: "intent inconnu" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/plan:", err);
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}

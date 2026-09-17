import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/validation";
import { consumeLimit } from "@/lib/rate-limit";
import { jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/session";
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
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const id = await me();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await consumeLimit(`plan:${id}`,60,60))) return NextResponse.json({error:"Trop de demandes. Réessaie dans une minute."},{status:429});
  const body = await jsonObject(request);
  if (!body) return NextResponse.json({error:"Demande invalide."},{status:400});
  if (!isUuid(body.raceId)) {
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
    revalidatePath("/ma-saison");
    revalidatePath("/club");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/plan:", err);
    return NextResponse.json({ error: "Échec" }, { status: 500 });
  }
}

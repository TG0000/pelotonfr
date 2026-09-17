import { isUuid } from "@/lib/validation";
import { consumeLimit } from "@/lib/rate-limit";
import { visitorKey, jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { createReport, isReportKind } from "@/lib/db/queries/reports";

/**
 * Un lecteur nous prévient.
 *
 * Ouvert à tous : c'est souvent l'organisateur, sans compte, qui voit le
 * premier qu'un horaire est faux. Le message est borné, le contact facultatif.
 */
export async function POST(request: NextRequest) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  if (!(await consumeLimit(`report:${visitorKey(request)}`,5,3600))) return NextResponse.json({error:"Réessaie dans une heure."},{status:429});
  const body=await jsonObject(request);
  if(!body)return NextResponse.json({error:"Demande invalide."},{status:400});
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!isReportKind(kind)) {
    return NextResponse.json({ error: "Dites-nous ce qui ne va pas" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 160) : "";
  const raceId =
    isUuid(body.raceId) ? body.raceId : null;
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : null;

  if (kind === "autre" && !message) {
    return NextResponse.json({ error: "Un mot pour dire de quoi il s'agit" }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const user = await currentUser();
      const resolved = await resolveUser(clerkId, user?.primaryEmailAddress?.emailAddress ?? null);
      userId = resolved ?? null;
    }
  } catch {
    userId = null;
  }

  try {
    await createReport({ raceId, kind, message: message || null, contact: contact || null, page, userId });
  } catch {
    return NextResponse.json({ error: "Le signalement n'a pas pu être enregistré, réessayez" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

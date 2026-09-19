import { consumeLimit } from "@/lib/rate-limit";
import { jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/session";
import {
  resolveUser,
  getUserAlertRules,
  createAlertRule,
  getRuleMatches, countRuleMatches,
} from "@/lib/db/queries/alerts";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await currentUser();
    const id = await resolveUser(
      userId,
      user?.primaryEmailAddress?.emailAddress ?? null
    );
    const rules = await getUserAlertRules(id);

    // Each rule reports what it currently matches, so the page can say
    // "3 courses correspondent" rather than leaving the rider to guess.
    const withCounts = await Promise.all(
      rules.map(async (rule) => ({
        ...rule,
        matches: await getRuleMatches(rule.id, { limit: 5 }),
        matchCount: await countRuleMatches(rule.id),
      }))
    );

    return NextResponse.json({ rules: withCounts });
  } catch (err) {
    console.error("GET /api/alerts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await consumeLimit(`alerts:${userId}`,10,60))) return NextResponse.json({error:"Trop de demandes. Réessaie dans une minute."},{status:429});
  const body = await jsonObject(request);
  if (!body) return NextResponse.json({error:"Demande invalide."},{status:400});
  const radiusKm = Number(body.radiusKm ?? 50);
  const leadTimeDays = Number(body.leadTimeDays ?? 21);

  if (!Number.isFinite(radiusKm) || radiusKm < 5 || radiusKm > 500) {
    return NextResponse.json({ error: "radiusKm hors bornes" }, { status: 400 });
  }
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 1 || leadTimeDays > 120) {
    return NextResponse.json({ error: "leadTimeDays hors bornes" }, { status: 400 });
  }

  if ((body.lat != null || body.lng != null) &&
      !(typeof body.lat === "number" && Number.isFinite(body.lat) && Math.abs(body.lat)<=90 && typeof body.lng === "number" && Number.isFinite(body.lng) && Math.abs(body.lng)<=180)) {
    return NextResponse.json({error:"Coordonnées invalides."},{status:400});
  }
  for (const key of ["federations","disciplines","categories"]) {
    const values=body[key];
    if(values!==undefined && (!Array.isArray(values)||values.length>40||values.some(v=>typeof v!=="string"||v.length>80)))return NextResponse.json({error:"Filtres invalides."},{status:400});
  }
  const asArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  try {
    const user = await currentUser();
    const id = await resolveUser(
      userId,
      user?.primaryEmailAddress?.emailAddress ?? null
    );

    const rule = await createAlertRule(id, {
      label: typeof body.label === "string" ? body.label.slice(0, 120) : null,
      federations: asArray(body.federations),
      disciplines: asArray(body.disciplines),
      categories: asArray(body.categories),
      lat: body.lat != null ? Number(body.lat) : null,
      lng: body.lng != null ? Number(body.lng) : null,
      radiusKm,
      leadTimeDays,
    });

    return NextResponse.json({ rule });
  } catch (err) {
    console.error("POST /api/alerts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  resolveUser,
  getUserAlertRules,
  createAlertRule,
  getRuleMatches,
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
      }))
    );

    return NextResponse.json({ rules: withCounts });
  } catch (err) {
    console.error("GET /api/alerts:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const radiusKm = Number(body.radiusKm ?? 50);
  const leadTimeDays = Number(body.leadTimeDays ?? 21);

  if (!Number.isFinite(radiusKm) || radiusKm < 5 || radiusKm > 500) {
    return NextResponse.json({ error: "radiusKm hors bornes" }, { status: 400 });
  }
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 1 || leadTimeDays > 120) {
    return NextResponse.json({ error: "leadTimeDays hors bornes" }, { status: 400 });
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

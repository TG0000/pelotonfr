import { isUuid } from "@/lib/validation";
import { jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/session";
import {
  resolveUser,
  deleteAlertRule,
  setAlertRuleActive,
} from "@/lib/db/queries/alerts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  if (!mutationOriginAllowed(_request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({error:"Identifiant invalide."},{status:400});
  try {
    const internalId = await resolveUser(userId);
    const removed = await deleteAlertRule(internalId, id);
    if (!removed) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/alerts/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({error:"Identifiant invalide."},{status:400});
  const body = await jsonObject(request);
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive requis" }, { status: 400 });
  }

  try {
    const internalId = await resolveUser(userId);
    const updated = await setAlertRuleActive(internalId, id, body.isActive);
    if (!updated) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/alerts/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

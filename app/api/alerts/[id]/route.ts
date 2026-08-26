import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  resolveUser,
  deleteAlertRule,
  setAlertRuleActive,
} from "@/lib/db/queries/alerts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { isActive?: boolean };
  if (typeof body.isActive !== "boolean") {
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

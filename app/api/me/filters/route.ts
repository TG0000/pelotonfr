import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getUserFilters, setUserFilters } from "@/lib/db/queries/filters";

/**
 * La recherche retenue, côté compte.
 *
 * Le cookie suffit sur un appareil ; le compte la porte d'un appareil à
 * l'autre. Le navigateur écrit ici chaque fois qu'il écrit le cookie, et le
 * calendrier lit ici quand un coureur connecté arrive sans cookie.
 */
async function me(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return resolveUser(user.id, user.email);
}

export async function GET() {
  const id = await me();
  if (!id) return NextResponse.json({ filters: null }, { status: 401 });
  return NextResponse.json({ filters: await getUserFilters(id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const id = await me();
  if (!id) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { filters?: unknown };
  const filters = typeof body.filters === "string" ? body.filters.slice(0, 2000) : "";
  await setUserFilters(id, filters);
  return NextResponse.json({ ok: true });
}

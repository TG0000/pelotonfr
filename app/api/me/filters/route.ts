import { consumeLimit } from "@/lib/rate-limit";
import { jsonObject } from "@/lib/request-security";
import { mutationOriginAllowed } from "@/lib/request-security";
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
  if (!mutationOriginAllowed(req)) return NextResponse.json({error:"Origine refusée."},{status:403});
  const id = await me();
  if (!id) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await consumeLimit(`filters:${id}`,60,60))) return NextResponse.json({error:"Trop de demandes. Réessaie dans une minute."},{status:429});
  const body = await jsonObject(req);
  if (!body) return NextResponse.json({error:"Demande invalide."},{status:400});

  /* « Efface » et « tu n'as rien envoyé » ne sont pas la même demande : une
     clé mal orthographiée effaçait la recherche retenue et répondait 200. */
  if (typeof body.filters !== "string") {
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  }
  await setUserFilters(id, body.filters.slice(0, 2000));
  return NextResponse.json({ ok: true });
}

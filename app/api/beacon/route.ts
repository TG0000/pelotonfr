import { NextRequest, NextResponse } from "next/server";
import { recordPageView } from "@/lib/db/queries/reports";

/**
 * Une vue de page, sans personne dedans.
 *
 * L'hébergeur déduit une commune de la connexion et la met dans des en-têtes ;
 * on garde la commune et le chemin, jamais l'adresse. Assez pour voir d'où le
 * site est lu en ce moment.
 */
export async function POST(request: NextRequest) {
  let path = "/";
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body.path === "string") path = body.path.slice(0, 200);
  } catch {
    // Une balise sans corps compte quand même comme une vue de l'accueil.
  }
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  const h = request.headers;
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  const city = h.get("x-vercel-ip-city");

  try {
    await recordPageView({
      path,
      city: city ? decodeURIComponent(city) : null,
      region: h.get("x-vercel-ip-country-region"),
      country: h.get("x-vercel-ip-country"),
      lat: num(h.get("x-vercel-ip-latitude")),
      lng: num(h.get("x-vercel-ip-longitude")),
    });
  } catch {
    // Une vue perdue ne vaut pas une erreur pour le lecteur.
  }
  return NextResponse.json({ ok: true });
}

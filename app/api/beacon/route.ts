import { analyticsAllowed, CONSENT_COOKIE } from "@/lib/consent";
import { jsonObject, mutationOriginAllowed, visitorKey } from "@/lib/request-security";
import { consumeLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { recordPageView } from "@/lib/db/queries/reports";
import { isOperator } from "@/lib/admin";

/**
 * Une vue de page, sans personne dedans.
 *
 * L'hébergeur déduit une commune de la connexion et la met dans des en-têtes ;
 * on garde la commune et le chemin, jamais l'adresse. Assez pour voir d'où le
 * site est lu en ce moment.
 */
export async function POST(request: NextRequest) {
  if (!analyticsAllowed(request.cookies.get(CONSENT_COOKIE)?.value)) return new NextResponse(null, { status: 204 });
  if (!mutationOriginAllowed(request)) return NextResponse.json({ok:false},{status:403});
  if (!(await consumeLimit(`beacon:${visitorKey(request)}`,60,60))) return NextResponse.json({ok:false},{status:429});
  const body=await jsonObject(request,1024);
  if(!body || typeof body.path!=="string" || !body.path.startsWith("/")) return NextResponse.json({ok:false},{status:400});
  const path=body.path.split(/[?#]/)[0].slice(0,200);
  if (["/admin", "/api", "/profil", "/club", "/ma-saison", "/alertes", "/contact", "/coureur"].some(prefix => path.startsWith(prefix))) {
    return NextResponse.json({ ok: true });
  }

  const h = request.headers;
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  const city = h.get("x-vercel-ip-city");

  // Exclure les vues de l'opérateur reconnu par sa session, sans identifiant de suivi.
  let operator = false;
  try { operator = await isOperator(); } catch { /* session indisponible */ }

  try {
    await recordPageView({
      operator,
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
  const res = NextResponse.json({ ok: true });

  return res;
}

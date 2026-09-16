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
  if (!mutationOriginAllowed(request)) return NextResponse.json({ok:false},{status:403});
  if (!(await consumeLimit(`beacon:${visitorKey(request)}`,60,60))) return NextResponse.json({ok:false},{status:429});
  const body=await jsonObject(request,1024);
  if(!body || typeof body.path!=="string" || !body.path.startsWith("/")) return NextResponse.json({ok:false},{status:400});
  const path=body.path.split(/[?#]/)[0].slice(0,200);
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  const h = request.headers;
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
  const city = h.get("x-vercel-ip-city");

  /* L'opérateur regarde son site cent fois par jour : ses vues sont marquées
     et sortent des chiffres. Reconnu par sa session, et par un cookie posé la
     première fois, pour que ses passages déconnectés sur le même navigateur
     comptent pareil. */
  let operator = request.cookies.get("pelotonfr.op")?.value === "1";
  if (!operator) {
    try {
      operator = await isOperator();
    } catch {
      operator = false;
    }
  }

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
  if (operator) res.cookies.set("pelotonfr.op", "1", { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  return res;
}

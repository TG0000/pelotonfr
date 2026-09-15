import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { DAILY_CAP } from "@/lib/streetview";

/**
 * « Puis-je ouvrir Street View ? » — demandé au clic, jamais au chargement.
 *
 * La clé du navigateur est restreinte au domaine chez Google ; ici on tient
 * en plus un compteur par jour, pour que le site ne coûte rien même le jour
 * où quelqu'un s'amuse à recharger. Au-delà du plafond, le lecteur garde le
 * lien vers Google Maps, qui ne coûte rien.
 */
export async function POST() {
  const key = process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "Street View n'est pas configuré." }, { status: 503 });
  try {
    const [row] = await sql(
      `INSERT INTO streetview_loads (day, n) VALUES (CURRENT_DATE, 1)
       ON CONFLICT (day) DO UPDATE SET n = streetview_loads.n + 1
       RETURNING n`
    );
    const n = Number(row?.n ?? 0);
    if (n > DAILY_CAP) {
      return NextResponse.json({ ok: false, reason: "Le quota du jour est atteint, réessaie demain." }, { status: 429 });
    }
    return NextResponse.json({ ok: true, key, today: n, cap: DAILY_CAP }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "Compteur indisponible." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { transaction } from "@/lib/db/transaction";
import { DAILY_CAP, MONTHLY_CAP } from "@/lib/streetview";
import { mutationOriginAllowed, visitorKey } from "@/lib/request-security";
import { consumeLimit } from "@/lib/rate-limit";

/** Application reservation only; provider-side billing limits remain necessary. */
export async function POST(request: Request) {
  if (!mutationOriginAllowed(request)) return NextResponse.json({ok:false,reason:"Origine refusée."},{status:403});
  const key = process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!key || !DAILY_CAP || !MONTHLY_CAP) return NextResponse.json({ok:false,reason:"Street View n’est pas configuré. Le lien Google Maps reste disponible."},{status:503});
  try {
    if (!(await consumeLimit(`streetview:${visitorKey(request)}`,5,3600))) return NextResponse.json({ok:false,reason:"Réessaie dans une heure."},{status:429});
    const allowed = await transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(786431)");
      const {rows} = await client.query(`SELECT COALESCE(sum(n) FILTER(WHERE day=CURRENT_DATE),0) AS today,COALESCE(sum(n),0) AS month FROM streetview_loads WHERE day>=date_trunc('month',CURRENT_DATE)::date`);
      if (Number(rows[0].today)>=DAILY_CAP || Number(rows[0].month)>=MONTHLY_CAP) return false;
      await client.query("INSERT INTO streetview_loads(day,n) VALUES(CURRENT_DATE,1) ON CONFLICT(day) DO UPDATE SET n=streetview_loads.n+1");
      return true;
    });
    if (!allowed) return NextResponse.json({ok:false,reason:"Le budget d’ouvertures est atteint. Utilise le lien Google Maps."},{status:429});
    return NextResponse.json({ok:true,key},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({ok:false,reason:"Compteur indisponible."},{status:503}); }
}

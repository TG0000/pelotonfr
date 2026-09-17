import { publicStravaEnabled } from "@/lib/strava/policy";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** La photo de route recadrée vers l'avant, telle que la vision l'a vue. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pictureId = id.replace(/\.jpg$/, "");
  const [row] = await sql(`SELECT crop FROM road_views WHERE picture_id = $1 AND ($2::boolean OR EXISTS(SELECT 1 FROM race_traces t WHERE t.race_id=road_views.race_id AND t.source='guide'))`, [pictureId, publicStravaEnabled()]);
  const crop = row?.crop as Buffer | Uint8Array | string | null | undefined;
  if (!crop) return NextResponse.json({ error: "Pas de recadrage" }, { status: 404 });
  // Le pilote HTTP de Neon rend un bytea en texte hexadécimal « \\x… ».
  const bytes = typeof crop === "string" ? Buffer.from(crop.replace(/^\\x/, ""), "hex") : Buffer.from(crop);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}

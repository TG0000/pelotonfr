import { NextResponse } from "next/server";
import { isOperator } from "@/lib/admin";

/** « Suis-je l'opérateur ? » — demandé par la barre, après le rendu, pour que
    la mise en page reste statique et l'accueil en cache. */
export async function GET() {
  return NextResponse.json({ operator: await isOperator() }, { headers: { "Cache-Control": "private, no-store" } });
}

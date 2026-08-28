import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendClubReminders } from "@/lib/club-reminder";

export const maxDuration = 60;

/**
 * Le rappel quotidien aux responsables de club.
 *
 * Sur le cron de Vercel plutôt que dans la collecte chez GitHub, pour la même
 * raison que la surveillance : ce qui doit prévenir ne peut pas dépendre de ce
 * qu'il surveille. Une collecte à l'arrêt ne doit pas emporter les rappels avec
 * elle — un responsable qui n'est pas prévenu manque une clôture, et ça ne se
 * rattrape pas.
 *
 * Fenêtre de 48 heures et un seul rappel par course : le deuxième e-mail
 * identique est ce qui apprend à ignorer le premier.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendClubReminders(sql, { withinHours: 48 });
    return NextResponse.json({
      responsables: result.officers,
      courses: result.races,
      envois: result.sent,
      aBlanc: result.dryRun,
    });
  } catch (err) {
    console.error("cron club:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}

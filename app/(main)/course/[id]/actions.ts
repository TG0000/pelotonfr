"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { getConnection, getAccessToken } from "@/lib/db/queries/strava";
import { depositSegmentCircuit } from "@/lib/circuit-deposit";
import { createReport } from "@/lib/db/queries/reports";

/**
 * Un coureur qui connaît la boucle la dépose une fois, pour tout le monde.
 *
 * Le circuit d'une course de village n'existe nulle part en ligne, sauf en
 * segment Strava tracé par quelqu'un qui l'a couru. Coller ce lien suffit :
 * on lit le tracé, on relit le relief, et la page porte le parcours. Un dépôt
 * est une affirmation, pas une déduction — il prime sur ce que les sources
 * automatiques avaient trouvé, et rien ne l'écrase ensuite.
 */

export type DepositResult =
  | { ok: true; name: string; km: number; gainM: number; centreM: number }
  | { ok: false; message: string };

export async function deposerCircuit(
  raceId: string,
  segmentLink: string
): Promise<DepositResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, message: "Connecte-toi pour déposer un circuit." };

  const segmentId = Number(segmentLink.match(/(\d{4,})/)?.[1]);
  if (!segmentId) {
    return {
      ok: false,
      message: "Colle le lien d'un segment Strava (strava.com/segments/…).",
    };
  }

  if (!(await getConnection(user.id))) {
    return {
      ok: false,
      message: "Relie ton compte Strava dans ton profil : c'est lui qui lit le segment.",
    };
  }
  const token = await getAccessToken(user.id);
  if (!token) return { ok: false, message: "Strava n'a pas rendu de jeton, réessaie plus tard." };

  try {
    const out = await depositSegmentCircuit(sql, token, raceId, segmentId);
    // Le tableau de bord voit passer chaque dépôt : un circuit posé au mauvais
    // endroit se repère là, avant qu'un lecteur ne le signale.
    await createReport({
      raceId,
      kind: "circuit",
      message: `Circuit déposé : segment ${segmentId} « ${out.name} », ${(out.lengthM / 1000).toFixed(1)} km, centré à ${Math.round(out.centreM)} m de la commune.`,
      contact: user.email,
      page: `/course/${raceId}`,
      userId: user.id,
    }).catch(() => {});
    revalidatePath(`/course/${raceId}`);
    return {
      ok: true,
      name: out.name,
      km: Math.round(out.lengthM / 100) / 10,
      gainM: out.gainM,
      centreM: Math.round(out.centreM),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Le dépôt a échoué." };
  }
}

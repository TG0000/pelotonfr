"use server";

import { revalidatePath } from "next/cache";
import { isOperator } from "@/lib/admin";
import { dismissMiss, resolveMiss } from "@/lib/db/queries/startlist-queue";

/**
 * The two answers an arbitration can have.
 *
 * Both refuse silently-but-loudly for a visitor: the buttons are not rendered
 * unless the session is the operator's, and the action checks again, because a
 * hidden button is not a closed door.
 */

export async function attachStartlist(id: string, raceId: string) {
  if (!(await isOperator())) {
    return { ok: false as const, message: "Réservé à l'exploitant." };
  }
  await resolveMiss(id, raceId);
  revalidatePath("/etat");
  return {
    ok: true as const,
    message: "Liste rattachée. La collecte suivante l'appliquera.",
  };
}

export async function setAsideStartlist(id: string) {
  if (!(await isOperator())) {
    return { ok: false as const, message: "Réservé à l'exploitant." };
  }
  await dismissMiss(id);
  revalidatePath("/etat");
  return { ok: true as const, message: "Liste écartée de la file." };
}

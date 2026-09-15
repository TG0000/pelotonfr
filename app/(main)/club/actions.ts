"use server";

import { auth, currentUser } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { consumeLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { resolveUser } from "@/lib/db/queries/alerts";
import {
  getMembership,
  joinClub,
  leaveClub,
  markEntered,
  unmarkEntered,
  setViewerGroups,
} from "@/lib/db/queries/club";

/**
 * Ce qu'un membre de club peut faire.
 *
 * Chaque action revérifie qui appelle et à quel titre : un bouton caché n'est
 * pas une porte fermée, et « j'ai engagé » écrit pour le compte d'un club
 * entier est exactement le genre d'affirmation qu'on ne laisse pas au premier
 * venu.
 */

async function me(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return resolveUser(userId, user?.primaryEmailAddress?.emailAddress);
}

export async function rejoindre(clubId: string) {
  const id = await me();
  if (!id) return { ok: false as const, message: "Connecte-toi d'abord." };
  if (!isUuid(clubId)) return { ok: false as const, message: "Club invalide." };
  if (!(await consumeLimit(`club:join:${id}`, 5, 3600))) return { ok: false as const, message: "Réessaie dans une heure." };
  let role;
  try { role = await joinClub(id, clubId); }
  catch { return { ok: false as const, message: "Impossible de rejoindre ce club. Vérifie ton club actuel puis réessaie." }; }
  revalidatePath("/club");
  return {
    ok: true as const,
    message:
      role === "pending"
        ? "Demande enregistrée. L’accès sera ouvert après vérification ; utilise Contact pour faire vérifier ton rôle."
        : "Club rejoint.",
  };
}

export async function quitter() {
  const id = await me();
  if (!id) return { ok: false as const, message: "Connecte-toi d'abord." };
  await leaveClub(id);
  revalidatePath("/club");
  return { ok: true as const, message: "Club quitté." };
}

export async function marquerEngage(raceId: string) {
  const id = await me();
  if (!id) return { ok: false as const, message: "Connecte-toi d'abord." };

  const membership = await getMembership(id);
  if (!membership || membership.role !== "responsable") {
    return { ok: false as const, message: "Réservé au responsable du club." };
  }

  await markEntered(membership.clubId, raceId, id);
  revalidatePath("/club");
  return { ok: true as const, message: "Course marquée engagée." };
}

export async function annulerEngage(raceId: string) {
  const id = await me();
  if (!id) return { ok: false as const, message: "Connecte-toi d'abord." };

  const membership = await getMembership(id);
  if (!membership || membership.role !== "responsable") {
    return { ok: false as const, message: "Réservé au responsable du club." };
  }

  await unmarkEntered(membership.clubId, raceId);
  revalidatePath("/club");
  return { ok: true as const, message: "Remise dans la file." };
}

/** Les groupes dans lesquels le lecteur s'aligne. */
export async function saveGroups(groups: string[]): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  const user = await currentUser();
  const id = await resolveUser(userId, user?.primaryEmailAddress?.emailAddress);
  await setViewerGroups(id, groups);
  revalidatePath("/club");
}

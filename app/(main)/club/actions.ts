"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { resolveUser } from "@/lib/db/queries/alerts";
import {
  getMembership,
  joinClub,
  leaveClub,
  markEntered,
  unmarkEntered,
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
  const role = await joinClub(id, clubId);
  revalidatePath("/club");
  return {
    ok: true as const,
    message:
      role === "responsable"
        ? "Club rejoint. Tu en es le responsable : personne d'autre ne s'y était inscrit."
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

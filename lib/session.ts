import { headers } from "next/headers";
import { auth as betterAuth } from "@/lib/auth";

/**
 * La session, côté serveur, sous la forme que le code attendait de Clerk.
 *
 * Vingt fichiers écrivaient `const { userId } = await auth()` puis lisaient
 * l'e-mail sur `currentUser()`. Plutôt que vingt réécritures qui disent la
 * même chose, les deux fonctions gardent leur forme et changent de source :
 * `userId` est l'identifiant Better Auth, que `users.clerk_id` porte
 * désormais — le nom de colonne est un vestige, la valeur est à jour.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const session = await betterAuth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const name = session.user.name?.trim() || null;
    return {
      id: session.user.id,
      email: session.user.email,
      name,
      firstName: name ? name.split(/\s+/)[0] : null,
    };
  } catch {
    return null;
  }
}

/** `{ userId }` — null quand personne n'est connecté. */
export async function auth(): Promise<{ userId: string | null }> {
  const user = await getAuthUser();
  return { userId: user?.id ?? null };
}

/** L'utilisateur connecté, avec l'adresse là où le code la cherchait. */
export async function currentUser(): Promise<
  | { id: string; firstName: string | null; primaryEmailAddress: { emailAddress: string } }
  | null
> {
  const user = await getAuthUser();
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    primaryEmailAddress: { emailAddress: user.email },
  };
}

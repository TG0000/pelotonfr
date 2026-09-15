import { symmetricDecrypt } from "better-auth/crypto";
import { sql } from "@/lib/db";
import { resolveUser } from "@/lib/db/queries/alerts";
import { saveConnection, saveFitness } from "@/lib/db/queries/strava";
import { getAthleteSummary, STRAVA_SCOPES } from "@/lib/strava/client";

/**
 * Le compte Strava que Better Auth vient d'enregistrer devient une connexion
 * Strava chez nous.
 *
 * Deux chemins mènent à Strava : un coureur qui se connecte *avec* Strava
 * (le compte se crée en même temps) et un coureur déjà là qui rattache son
 * Strava. Dans les deux cas Better Auth écrit une ligne `account` avec les
 * jetons ; c'est ici qu'elle est recopiée dans `strava_connections`, que
 * tout le reste du site lit — la synchronisation des sorties, le dépôt de
 * circuits, l'index des segments.
 *
 * Ne lève jamais : une erreur ici ferait échouer la connexion elle-même,
 * alors que la ligne se recopie au prochain passage.
 */
export interface OAuthAccountRow {
  providerId: string;
  accountId: string;
  userId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  scope?: string | null;
}

/** Strava rend des jetons de six heures ; à défaut d'échéance lue, on prend celle-là. */
const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000;

export async function mirrorStravaAccount(account: OAuthAccountRow): Promise<void> {
  if (account.providerId !== "strava") return;
  if (!account.accessToken || !account.refreshToken) return;

  try {
    const [user] = await sql(`SELECT email, name FROM "user" WHERE id = $1::text`, [
      account.userId,
    ]);
    const email = (user?.email as string | undefined) ?? null;
    const name = ((user?.name as string | undefined) ?? "").trim() || null;

    const id = await resolveUser(account.userId, email);
    // Database hooks receive the encrypted values persisted by Better Auth.
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("Auth encryption is not configured");
    const accessToken = await symmetricDecrypt({ key: secret, data: account.accessToken });
    const refreshToken = await symmetricDecrypt({ key: secret, data: account.refreshToken });
    await saveConnection({
      userId: id,
      athleteId: Number(account.accountId),
      accessToken,
      refreshToken,
      expiresAt: account.accessTokenExpiresAt
        ? new Date(account.accessTokenExpiresAt)
        : new Date(Date.now() + TOKEN_LIFETIME_MS),
      scope: account.scope ?? STRAVA_SCOPES,
      athleteName: name,
    });

    const summary = await getAthleteSummary(accessToken);
    await saveFitness(id, summary.ftp, summary.weightKg);
  } catch {
    console.error("STRAVA_MIRROR_FAILED: reconnect the Strava account");
  }
}

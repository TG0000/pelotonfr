import { appleProvider } from "@/lib/apple-auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink } from "better-auth/plugins";
import { getDatabasePool } from "@/lib/db/transaction";
import { sendMail } from "@/lib/mail";
import { sendMagicLinkEmail } from "@/lib/auth-mail";
import { mirrorStravaAccount } from "@/lib/strava/account";
import {
  exchangeCode,
  placeholderEmail,
  stravaConfigured,
  STRAVA_SCOPES,
} from "@/lib/strava/client";

/** Verified addresses and explicit OAuth linking; no account migration by email. */
const STRAVA_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";

interface StravaAthlete {
  id: number;
  firstname?: string;
  lastname?: string;
  profile_medium?: string;
}

/**
 * Strava ne dit pas l'adresse e-mail d'un athlète. Better Auth en exige une :
 * le compte en porte une fictive, reconnaissable, remplacée depuis le profil.
 */
function stravaUser(athlete: StravaAthlete) {
  const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
  return {
    id: athlete.id,
    name: name || `Athlète ${athlete.id}`,
    email: placeholderEmail(athlete.id),
    emailVerified: false,
    image: athlete.profile_medium,
  };
}

const stravaProvider = stravaConfigured()
  ? [
      {
        providerId: "strava",
        name: "Strava",
        clientId: process.env.STRAVA_CLIENT_ID!,
        clientSecret: process.env.STRAVA_CLIENT_SECRET!,
        authorizationUrl: STRAVA_AUTHORIZE,
        tokenUrl: STRAVA_TOKEN,
        // Strava sépare ses scopes par des virgules, pas des espaces : un seul
        // élément, déjà assemblé, passe tel quel.
        scopes: [STRAVA_SCOPES],
        // Strava ne connaît pas PKCE et ne rend pas `expires_in` : l'échange
        // du code passe par notre client, qui lit `expires_at`.
        pkce: false,
        authorizationUrlParams: { approval_prompt: "auto" },
        getToken: async ({ code }: { code: string }) => {
          const t = await exchangeCode(code);
          return {
            accessToken: t.accessToken,
            refreshToken: t.refreshToken,
            accessTokenExpiresAt: t.expiresAt,
            scopes: STRAVA_SCOPES.split(","),
            raw: {
              athlete: {
                id: t.athleteId,
                firstname: t.athleteName?.split(" ")[0],
                lastname: t.athleteName?.split(" ").slice(1).join(" "),
                profile_medium: t.avatarUrl ?? undefined,
              } satisfies StravaAthlete,
            },
          };
        },
        getUserInfo: async (tokens: { accessToken?: string; raw?: Record<string, unknown> }) => {
          const fromToken = tokens.raw?.athlete as StravaAthlete | undefined;
          if (fromToken?.id) return stravaUser(fromToken);
          if (!tokens.accessToken) return null;
          const res = await fetch("https://www.strava.com/api/v3/athlete", {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) return null;
          return stravaUser((await res.json()) as StravaAthlete);
        },
      },
    ]
  : [];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL}` : undefined),
  trustedOrigins: ["https://appleid.apple.com", process.env.BETTER_AUTH_URL, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined, process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined].filter((value): value is string => Boolean(value)),
  secret: process.env.BETTER_AUTH_SECRET,
  database: getDatabasePool(),
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
  emailAndPassword: { enabled: false },
  socialProviders: {
    apple: appleProvider,
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    } : {}),
  },
  emailVerification: {
    expiresIn: 900,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, subject: "Vérifie ton adresse PelotonFR", text: `Confirme cette adresse avec ce lien valable 15 minutes :\n${url}` });
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // Un coureur connecté par e-mail rattache son Strava : l'adresse que
      // Strava « donne » est fictive, elle ne correspondra jamais.
      trustedProviders: ["google"],
      allowDifferentEmails: true,
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      // The new address must prove ownership before it becomes an identity.
      updateEmailWithoutVerification: false,
    },
  },
  databaseHooks: {
    user: {
      update: { after: async (user) => {
        const { resolveUser } = await import("@/lib/db/queries/alerts");
        await resolveUser(user.id);
      } },
    },
    account: {
      create: { after: async (account) => mirrorStravaAccount(account) },
      update: { after: async (account) => mirrorStravaAccount(account) },
    },
  },
  session: {
    // Une saison : on ne se reconnecte pas tous les week-ends.
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    genericOAuth({ config: stravaProvider }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import { sendMagicLinkEmail } from "@/lib/auth-mail";
import { mirrorStravaAccount } from "@/lib/strava/account";
import {
  exchangeCode,
  placeholderEmail,
  stravaConfigured,
  STRAVA_SCOPES,
} from "@/lib/strava/client";

/**
 * Les comptes, chez nous.
 *
 * Clerk plafonnait l'instance de développement à cent utilisateurs et
 * exigeait un domaine pour aller au-delà. Better Auth vit dans l'application
 * et dans notre base : pas de plafond, pas de domaine à acheter, et l'adresse
 * e-mail d'un coureur ne quitte pas le site.
 *
 * On se connecte par un lien reçu par e-mail — pas de mot de passe à
 * retenir, rien à réinitialiser — et par Google quand ses clés sont posées.
 * Apple viendra avec un domaine : c'est Apple qui l'exige, pas nous.
 *
 * Et par Strava : c'est là que sont les coureurs, et c'est la connexion qui
 * donne au site sa matière (sorties, circuits, niveau). Un clic sur Strava
 * crée le compte et relie les sorties en même temps — trois étapes de moins
 * que « e-mail, lien, profil, connecter ».
 */

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
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon serveur ; une fonction Vercel n'a pas besoin de plus.
    max: 3,
    ssl: { rejectUnauthorized: false },
  }),
  emailAndPassword: { enabled: false },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  account: {
    accountLinking: {
      enabled: true,
      // Un coureur connecté par e-mail rattache son Strava : l'adresse que
      // Strava « donne » est fictive, elle ne correspondra jamais.
      trustedProviders: ["google", "strava"],
      allowDifferentEmails: true,
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      // Un compte né sur Strava porte une adresse fictive, non vérifiée : la
      // vraie la remplace sans détour.
      updateEmailWithoutVerification: true,
    },
  },
  databaseHooks: {
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
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    genericOAuth({ config: stravaProvider }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import { sendMagicLinkEmail } from "@/lib/auth-mail";

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
 */
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
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

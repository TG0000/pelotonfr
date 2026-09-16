import { CANONICAL_SITE_URL } from "@/lib/site-url";
import type { MetadataRoute } from "next";

/** Les pages publiques s'indexent ; l'espace personnel et l'API non. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === "preview") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ma-saison", "/profil", "/club", "/alertes", "/sign-in", "/sign-up", "/connexion", "/admin"],
    },
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
  };
}

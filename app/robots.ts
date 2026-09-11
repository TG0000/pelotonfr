import type { MetadataRoute } from "next";

/** Les pages publiques s'indexent ; l'espace personnel et l'API non. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ma-saison", "/profil", "/club", "/alertes", "/sign-in", "/sign-up"],
    },
    sitemap: "https://pelotonfr.vercel.app/sitemap.xml",
  };
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  env: {
    NEXT_PUBLIC_STRAVA_SIGNIN: process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET ? "true" : "false",
    NEXT_PUBLIC_APPLE_SIGNIN: [process.env.APPLE_CLIENT_ID, process.env.APPLE_TEAM_ID, process.env.APPLE_KEY_ID, process.env.APPLE_PRIVATE_KEY].every(value => Boolean(value?.trim())) ? "true" : "false",
    NEXT_PUBLIC_GOOGLE_SIGNIN: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? "true" : "false",
  },
  /* Les adresses de connexion de l'ancien service restent valables.

     /courses et /carte sont deux lectures du calendrier, gardées pour les
     liens et les favoris. Elles le disaient jusqu'ici depuis un composant,
     avec `redirect()` : en flux, Next pose alors une balise meta et renvoie
     200 sur une page vide au titre générique. Un robot n'y voit pas une
     redirection, il y voit une page sans contenu. Déclarées ici, elles
     partent en 308 avant le rendu, et Google reporte le crédit sur
     /calendrier au lieu de l'éparpiller. */
  async redirects() {
    return [
      { source: "/courses", missing: [{ type: "query" as const, key: "vue" }], destination: "/calendrier?vue=liste", permanent: true },
      { source: "/courses", destination: "/calendrier", permanent: true },
      { source: "/carte", missing: [{ type: "query" as const, key: "vue" }], destination: "/calendrier?vue=carte", permanent: true },
      { source: "/carte", destination: "/calendrier", permanent: true },
      { source: "/sign-in", destination: "/connexion", permanent: true },
      { source: "/sign-in/:path*", destination: "/connexion", permanent: true },
      { source: "/sign-up", destination: "/connexion", permanent: true },
      { source: "/sign-up/:path*", destination: "/connexion", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ...(process.env.VERCEL_ENV === "preview" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
    ] }, ...["/api/auth/:path*", "/api/me/:path*", "/api/plan", "/api/alerts/:path*", "/api/strava/:path*", "/api/streetview/:path*", "/api/reports", "/api/beacon"].map(source => ({
      source, headers: [{ key: "Cache-Control", value: "private, no-store" }],
    }))];
  },
  /* Chaque page de département et le plan du site sont rendus à partir de la
     base : une erreur passagère de celle-ci — Neon les marque lui-même
     « retryable » — suffit alors à faire échouer un déploiement entier pour
     une seule page sur quatre-vingt-quinze. On réessaie avant d'abandonner. */
  experimental: {
    staticGenerationRetryCount: 2,
  },
  turbopack: {},
};

export default nextConfig;

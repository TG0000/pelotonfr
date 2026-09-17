import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  env: {
    NEXT_PUBLIC_STRAVA_SIGNIN: process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET ? "true" : "false",
    NEXT_PUBLIC_GOOGLE_SIGNIN: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? "true" : "false",
  },
  // Les adresses de connexion de l'ancien service restent valables.
  async redirects() {
    return [
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
  turbopack: {},
};

export default nextConfig;

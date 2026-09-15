import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ...(process.env.VERCEL_ENV === "preview" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
    ] }];
  },
  turbopack: {},
};

export default nextConfig;

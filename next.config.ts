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
  turbopack: {},
};

export default nextConfig;

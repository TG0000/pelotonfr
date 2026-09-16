export const CANONICAL_SITE_URL = "https://pelotonfr.vercel.app";

/** Server-configured origins only: forwarded hosts must not choose OAuth redirects. */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  const vercel = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

import { headers } from "next/headers";

/**
 * The origin this request actually arrived on.
 *
 * OAuth redirect URIs must match the deployment exactly, and relying on an
 * environment variable alone fails silently: unset in production, the redirect
 * points at localhost and Strava rejects it with a callback-domain error that
 * says nothing about the real cause.
 *
 * Preference order:
 *   1. NEXT_PUBLIC_SITE_URL — an explicit choice, e.g. a custom domain that
 *      differs from the deployment host.
 *   2. The forwarded host of this request, which is correct on production,
 *      preview deployments and localhost alike.
 *   3. VERCEL_URL, for contexts with no request.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Called outside a request scope; fall through.
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

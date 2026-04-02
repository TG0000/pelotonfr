import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Webhook endpoint for GitHub Actions daily scraper.
 * Also registered as a Vercel Cron (vercel.json).
 *
 * For Vercel Cron, Vercel sends the CRON_SECRET as a Bearer token.
 * For GitHub Actions, we send the same secret in the Authorization header.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // In production, the actual scraping runs as a GitHub Actions job.
  // This endpoint is a lightweight trigger / health-check.
  // If you want to run scraping inside this function (Vercel Pro only),
  // import and call run-all.ts logic here.

  return NextResponse.json({
    ok: true,
    message: "Scrape job acknowledged. Running via GitHub Actions.",
    timestamp: new Date().toISOString(),
  });
}

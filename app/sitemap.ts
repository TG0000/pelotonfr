import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";

const SITE = "https://pelotonfr.vercel.app";

/**
 * Les pages qui méritent d'être trouvées : les courses à venir, et les pages
 * fixes. Une course passée reste consultable mais ne cherche plus personne.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/courses`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/calendrier`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/carte`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/mentions-legales`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/confidentialite`, changeFrequency: "yearly", priority: 0.1 },
  ];

  let races: Array<{ id: string; updated_at: string }> = [];
  try {
    races = (await sql(
      `SELECT id::text, updated_at::text
         FROM races
        WHERE race_date >= CURRENT_DATE AND is_cancelled = false
        ORDER BY race_date
        LIMIT 5000`,
      []
    )) as Array<{ id: string; updated_at: string }>;
  } catch {
    // Sans base, le plan ne perd que les courses : les pages fixes restent.
  }

  return [
    ...fixed,
    ...races.map((r) => ({
      url: `${SITE}/course/${r.id}`,
      lastModified: new Date(r.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

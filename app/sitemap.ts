import { CANONICAL_SITE_URL } from "@/lib/site-url";
import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { ARTICLES } from "@/lib/blog";

export const revalidate = 3600;

const SITE = CANONICAL_SITE_URL;

/**
 * Les pages qui méritent d'être trouvées : les courses à venir, et les pages
 * fixes. Une course passée reste consultable mais ne cherche plus personne.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/calendrier`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/departement`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/blog`, changeFrequency: "weekly", priority: 0.6 },
    ...ARTICLES.map((a) => ({
      url: `${SITE}/blog/${a.slug}`,
      lastModified: new Date(a.date),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${SITE}/cgu`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/mentions-legales`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE}/confidentialite`, changeFrequency: "yearly", priority: 0.1 },
  ];

  let races: Array<{ id: string; updated_at: string }> = [];
  let departments: string[] = [];
  try {
    departments = (
      (await sql(
        `SELECT DISTINCT department_code FROM races WHERE department_code IS NOT NULL AND department_name IS NOT NULL`,
        []
      )) as Array<{ department_code: string }>
    ).map((r) => r.department_code);
    races = (await sql(
      `SELECT id::text, updated_at::text
         FROM races
        WHERE COALESCE(race_date_end, race_date) >= (now() AT TIME ZONE 'Europe/Paris')::date AND is_cancelled = false AND is_active = true
        ORDER BY race_date
        LIMIT 5000`,
      []
    )) as Array<{ id: string; updated_at: string }>;
  } catch {
    // Sans base, le plan ne perd que les courses : les pages fixes restent.
  }

  return [
    ...fixed,
    ...departments.map((code) => ({
      url: `${SITE}/departement/${code}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...races.map((r) => ({
      url: `${SITE}/course/${r.id}`,
      lastModified: new Date(r.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

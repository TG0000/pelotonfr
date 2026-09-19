import { CANONICAL_SITE_URL } from "@/lib/site-url";
import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { ARTICLES } from "@/lib/blog";

export const revalidate = 3600;

const SITE = CANONICAL_SITE_URL;

/**
 * Les pages qui méritent d'être trouvées.
 *
 * Les courses à venir, bien sûr. Mais aussi celles de l'année écoulée : on
 * cherche « résultats Mantilly 2026 » longtemps après la ligne d'arrivée, et
 * ces pages-là portent le classement, le peloton et le circuit. Les laisser
 * hors du plan, c'était renoncer à la moitié des recherches.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/courses`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/calendrier`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/carte`, changeFrequency: "daily", priority: 0.7 },
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

  let races: Array<{ id: string; updated_at: string; past: boolean }> = [];
  let departments: string[] = [];
  try {
    departments = (
      (await sql(
        `SELECT DISTINCT department_code FROM races WHERE department_code IS NOT NULL AND department_name IS NOT NULL`,
        []
      )) as Array<{ department_code: string }>
    ).map((r) => r.department_code);
    races = (await sql(
      `SELECT id::text, updated_at::text,
              COALESCE(race_date_end, race_date) < (now() AT TIME ZONE 'Europe/Paris')::date AS past
         FROM races
        WHERE COALESCE(race_date_end, race_date) >= (now() AT TIME ZONE 'Europe/Paris')::date - 400
          AND is_cancelled = false AND is_active = true
        ORDER BY race_date DESC
        LIMIT 20000`,
      []
    )) as Array<{ id: string; updated_at: string; past: boolean }>;
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
      // Une course passée ne bouge plus ; une course à venir change chaque
      // semaine, engagés et météo compris.
      changeFrequency: (r.past ? "monthly" : "weekly") as "monthly" | "weekly",
      priority: r.past ? 0.4 : 0.6,
    })),
  ];
}

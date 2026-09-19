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
    /* /courses et /carte partent en 308 vers /calendrier : une redirection
       n'a rien à faire dans un plan, Google la compte comme une erreur. */
    { url: `${SITE}/calendrier`, changeFrequency: "daily", priority: 0.9 },
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
  let departments: Array<{ code: string; updated_at: string }> = [];
  let riders: Array<{ uci_id: string; updated_at: string | null }> = [];
  try {
    /* La date de dernière modification décide de la fréquence des passages :
       sans elle, cent départements et six mille coureurs sont relus au même
       rythme, qu'ils aient bougé cette nuit ou pas depuis six mois. */
    departments = (await sql(
      `SELECT department_code AS code, max(updated_at)::text AS updated_at
         FROM races
        WHERE department_code IS NOT NULL AND department_name IS NOT NULL
        GROUP BY department_code`,
      []
    )) as Array<{ code: string; updated_at: string }>;
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
    /* Les coureurs classés au national, et eux seuls. « Palmarès Untel
       cyclisme » est une vraie recherche, mais un site neuf a peu de crédit
       d'exploration : inonder le plan de cinquante mille fiches dont la
       plupart tiennent en une ligne retarderait la découverte des courses,
       qui sont ce qu'on vient chercher. Les six mille qui ont un rang ont une
       page qui vaut le détour : points, rang, saison par saison, palmarès. */
    riders = (await sql(
      `SELECT r.uci_id,
              (SELECT max(a.race_date)::text
                 FROM race_results s JOIN races a ON a.id = s.race_id
                WHERE s.rider_id = r.id) AS updated_at
         FROM riders r
        WHERE r.uci_id ~ '^[0-9]+$' AND r.current_rank IS NOT NULL AND r.result_count >= 5
        ORDER BY r.current_rank
        LIMIT 10000`,
      []
    )) as Array<{ uci_id: string; updated_at: string | null }>;
  } catch {
    // Sans base, le plan ne perd que les courses : les pages fixes restent.
  }

  return [
    ...fixed,
    ...departments.map((d) => ({
      url: `${SITE}/departement/${d.code}`,
      lastModified: new Date(d.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...riders.map((r) => ({
      url: `${SITE}/coureur/${r.uci_id}`,
      /* La dernière course courue : c'est le seul jour où sa fiche a changé
         pour de bon. Le classement bouge chaque nuit pour tout le monde. */
      ...(r.updated_at ? { lastModified: new Date(r.updated_at) } : {}),
      changeFrequency: "monthly" as const,
      priority: 0.3,
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

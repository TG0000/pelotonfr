import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The race list is a reading of the calendar too.
 *
 * Keeping it as a separate page meant two sets of filters over one query, and
 * a rider who narrowed a search in one place found none of it in the other.
 */
export default async function CoursesPage({ searchParams }: PageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === "vue") continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) params.append(key, v);
    }
  }
  params.set("vue", "liste");
  redirect(`/calendrier?${params.toString()}`);
}

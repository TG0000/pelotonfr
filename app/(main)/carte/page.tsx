import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The map is a reading of the calendar, not a place of its own.
 *
 * On its own it could only ever show every race in France, because the filters
 * a rider had already set lived on another page. It is now one of the calendar's
 * three views; this keeps existing links and bookmarks working.
 */
export default async function CartePage({ searchParams }: PageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === "vue") continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) params.append(key, v);
    }
  }
  params.set("vue", "carte");
  redirect(`/calendrier?${params.toString()}`);
}

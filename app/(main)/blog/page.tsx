import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Catégories, points, circuits, calendrier : ce qu'un coureur amateur cherche avant la course, expliqué sans jargon.",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function BlogPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Blog</h1>
        <p className="mt-1 text-muted-foreground">
          Ce qu&apos;un coureur amateur cherche avant la course, expliqué sans jargon.
        </p>
      </header>
      <ul className="divide-y divide-border/60">
        {ARTICLES.map((a) => (
          <li key={a.slug} className="py-5">
            <Link href={`/blog/${a.slug}`} className="group block">
              <h2 className="font-heading text-lg font-semibold group-hover:text-primary">{a.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
              <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                {dateFmt.format(new Date(a.date))} · {a.minutes} min
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

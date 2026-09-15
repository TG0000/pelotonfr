import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLES, getArticle } from "@/lib/blog";
import { StravaInvite } from "@/components/strava/StravaInvite";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: "Article introuvable" };
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: { title: a.title, description: a.description, type: "article", publishedTime: a.date },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/blog" className="hover:text-foreground">Blog</Link>
      </nav>
      <h1 className="font-heading text-3xl font-bold leading-tight">{a.title}</h1>
      <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
        {dateFmt.format(new Date(a.date))} · {a.minutes} min de lecture
      </p>
      <div className="mt-6 text-[15px]">{a.body}</div>
      <div className="mt-12">
        <StravaInvite compact />
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLES, getArticle } from "@/lib/blog";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
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
  const suivants = ARTICLES.filter((autre) => autre.slug !== a.slug).slice(0, 2);

  /* Un article daté, signé et rattaché au site : c'est ce qui permet à
     Google d'afficher la date sous le titre et de traiter la page comme un
     texte plutôt que comme une liste de plus. */
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.description,
    datePublished: a.date,
    dateModified: a.date,
    inLanguage: "fr-FR",
    wordCount: a.minutes * 200,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${CANONICAL_SITE_URL}/blog/${a.slug}` },
    author: { "@type": "Organization", name: "PelotonFR", url: CANONICAL_SITE_URL },
    publisher: { "@type": "Organization", name: "PelotonFR", url: CANONICAL_SITE_URL },
  };

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Breadcrumb
        trail={[
          { href: "/", label: "Accueil" },
          { href: "/blog", label: "Blog" },
        ]}
        current={a.title}
      />
      <h1 className="font-heading text-3xl font-bold leading-tight">{a.title}</h1>
      <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
        {dateFmt.format(new Date(a.date))} · {a.minutes} min de lecture
      </p>
      <div className="mt-6 text-[15px]">{a.body}</div>

      {suivants.length > 0 && (
        <nav className="mt-12 border-t pt-6">
          <h2 className="font-heading text-lg font-semibold">À lire ensuite</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {suivants.map((autre) => (
              <li key={autre.slug}>
                <Link href={`/blog/${autre.slug}`} className="text-sm font-medium text-primary hover:underline underline-offset-4">
                  {autre.title}
                </Link>
                <p className="text-sm text-muted-foreground">{autre.description}</p>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-12">
        <StravaInvite compact />
      </div>
    </article>
  );
}

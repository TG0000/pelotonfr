import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * Le chemin qui mène à la page, dit au lecteur et aux moteurs.
 *
 * Deux choses à la fois. Pour un coureur arrivé sur une fiche par une
 * recherche, c'est la sortie vers le calendrier de son département — la page
 * qui liste tout ce qui se court à côté. Pour Google, c'est un lien interne
 * depuis chacune des deux mille fiches vers la centaine de pages qui peuvent
 * réellement se classer sur « courses cyclistes en Mayenne », et un fil qu'il
 * affiche au-dessus du titre dans ses résultats.
 */
export interface Crumb {
  href: string;
  label: string;
}

export function Breadcrumb({ trail, current }: { trail: Crumb[]; current: string }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      ...trail.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.label,
        item: `${CANONICAL_SITE_URL}${c.href}`,
      })),
      { "@type": "ListItem", position: trail.length + 1, name: current },
    ],
  };

  return (
    <nav aria-label="Fil d'Ariane" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
      />
      {trail.map((c) => (
        <span key={c.href} className="flex items-center gap-1">
          <Link href={c.href} className="hover:text-foreground hover:underline underline-offset-2">
            {c.label}
          </Link>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </span>
      ))}
      <span className="truncate text-foreground">{current}</span>
    </nav>
  );
}

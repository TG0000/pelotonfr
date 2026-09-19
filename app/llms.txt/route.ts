import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * Les repères de lecture pour les moteurs qui répondent au lieu de lister.
 *
 * Écrit ici plutôt que déposé dans `public/` parce qu'il nomme le site une
 * dizaine de fois : la version figée portait encore l'adresse Vercel des
 * débuts, et chacun de ses liens serait devenu une redirection le jour où le
 * domaine a changé. Un seul endroit dit le domaine, et ce fichier le lit.
 */
export const dynamic = "force-static";

const SITE = CANONICAL_SITE_URL;

const CORPS = `# PelotonFR

> Calendrier indépendant du cyclisme amateur en France : FFC, FSGT et UFOLEP. Les informations officielles des organisateurs restent la référence.

PelotonFR aide à rechercher des épreuves, consulter leurs sources et préparer une saison. Une course enregistrée dans une saison ne constitue pas une inscription. Les horaires estimés et les tracés doivent être vérifiés auprès de l'organisateur. Les données de démonstration sont explicitement marquées « Démo ».

## Pages publiques
- [Accueil](${SITE}/)
- [Calendrier](${SITE}/calendrier) — toutes les courses, filtrables par période, département, fédération et catégorie
- [Départements](${SITE}/departement) — une page par département, avec ses courses à venir
- [Blog](${SITE}/blog)
- [Plan du site](${SITE}/sitemap.xml)

## Adresses des fiches
- Une course : ${SITE}/course/{identifiant}
- Un département : ${SITE}/departement/{code} — par exemple ${SITE}/departement/53
- Un coureur : ${SITE}/coureur/{identifiant UCI}

## Informations et droits
- [Conditions d'utilisation](${SITE}/cgu)
- [Confidentialité](${SITE}/confidentialite)
- [Mentions légales](${SITE}/mentions-legales)
- [Contact](${SITE}/contact)

Les espaces personnels et les données Strava privées ne sont pas des sources publiques. Ce fichier fournit des repères de lecture ; il n'accorde aucune licence supplémentaire sur les données, images ou marques des fournisseurs et ne remplace pas robots.txt.
`;

export function GET(): Response {
  return new Response(CORPS, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

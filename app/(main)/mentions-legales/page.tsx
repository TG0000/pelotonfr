import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Qui édite PelotonFR, qui l'héberge, et d'où viennent les données.",
};

/**
 * Ce que la loi demande à tout site publié en France, dit sans jargon.
 *
 * Le pied de page pointait vers cette page sans qu'elle existe : un 404 sur
 * les mentions légales, c'est la première chose qu'un lecteur attentif — ou
 * une fédération — remarque.
 */
export default function MentionsLegales() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Mentions légales</h1>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Éditeur</h2>
        <p>
          PelotonFR est un projet indépendant édité par Théo Guyard, coureur
          amateur licencié. Il n&apos;est affilié à aucune fédération.
        </p>
        <p>
          Contact :{" "}
          <a href="/contact" className="underline">
            le formulaire de contact
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Hébergement</h2>
        <p>
          Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.
          La base de données est hébergée par Neon Inc. dans l&apos;Union
          européenne.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Données</h2>
        <p>
          Les calendriers, listes d&apos;engagés et résultats sont lus sur les
          sites publics des fédérations (FFC, FSGT, UFOLEP) et de la presse
          cycliste régionale. Ils y restent la référence : en cas de doute, la
          fiche de l&apos;organisateur fait foi. Le relief provient de l&apos;IGN
          (RGE ALTI, licence ouverte) et de Mapzen ; les orthophotos de
          l&apos;IGN ; les fonds de carte d&apos;OpenFreeMap et OpenStreetMap.
        </p>
        <p>
          Les noms des coureurs figurant dans les listes d&apos;engagés et les
          classements sont ceux publiés par les fédérations. Tout coureur peut
          demander leur retrait à l&apos;adresse ci-dessus.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Vie privée</h2>
        <p>
          Ce que le site garde de vous, et pourquoi, est décrit dans la{" "}
          <Link href="/confidentialite" className="underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </section>
    </article>
  );
}

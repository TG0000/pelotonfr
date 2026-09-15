import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confidentialité",
  description: "Ce que PelotonFR garde de vous, pourquoi, et comment le retirer.",
};

/**
 * Ce que le site garde d'un coureur, dit comme on le dirait à un coéquipier.
 *
 * Il y a trois sources : le compte (Clerk), les sorties Strava si on les a
 * reliées, et ce qu'on a mis dans son calendrier. Rien n'est vendu, rien n'est
 * suivi par de la publicité, et tout se retire.
 */
export default function Confidentialite() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Confidentialité</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Le calendrier se consulte sans compte et sans traceur. Ce qui suit ne
        concerne que celles et ceux qui en créent un.
      </p>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Le compte</h2>
        <p>
          La connexion est assurée par Clerk, qui conserve votre adresse
          e-mail et, si vous l&apos;utilisez, votre identifiant Google ou Apple.
          PelotonFR n&apos;y garde que ce que vous y mettez : les courses de
          votre saison, vos alertes, votre club et votre catégorie.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Strava</h2>
        <p>
          Si vous reliez Strava, le site lit vos sorties pour reconnaître
          celles qui correspondent à une course et en tirer le tracé. Le tracé
          d&apos;une course devient visible par tous ; vos sorties, votre
          fréquence cardiaque et votre puissance ne le sont jamais. Le lien se
          coupe depuis votre profil ou depuis Strava, et les sorties sont alors
          effacées.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">E-mails</h2>
        <p>
          Vous ne recevez que ce que vous avez demandé : une alerte quand une
          course qui vous correspond paraît, un rappel avant la clôture des
          engagements de votre club. Chaque message contient de quoi
          l&apos;arrêter.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Cookies</h2>
        <p>
          Un seul, celui de la session de connexion. Aucune mesure d&apos;audience
          tierce, aucune publicité.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-sm leading-relaxed">
        <h2 className="font-heading text-lg font-semibold">Retirer ses données</h2>
        <p>
          Écrivez à{" "}
          <a href="/contact" className="underline">
            le formulaire de contact
          </a>{" "}
          : le compte et tout ce qui s&apos;y rattache sont supprimés sous
          quinze jours. Un coureur qui souhaite que son nom n&apos;apparaisse
          plus dans les listes d&apos;engagés ou les classements peut le demander
          de la même façon.
        </p>
      </section>
    </article>
  );
}

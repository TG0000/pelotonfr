import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Les articles du blog, écrits dans le code.
 *
 * Quatre articles par an ne justifient ni un CMS ni un convertisseur
 * Markdown : chacun est un composant, relu comme le reste du site. Ils
 * répondent aux questions qu'un coureur tape dans un moteur de recherche
 * avant de connaître le site — et chacun finit sur ce que le site en fait.
 */

export interface Article {
  slug: string;
  title: string;
  description: string;
  /** Date ISO de publication. */
  date: string;
  /** Minutes de lecture, arrondies. */
  minutes: number;
  body: ReactNode;
}

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-10 font-heading text-xl font-bold">{children}</h2>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 leading-relaxed">{children}</p>
);
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="mt-4 list-disc space-y-1.5 pl-5 leading-relaxed">{children}</ul>
);
const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono tabular-nums">{children}</span>
);

export const ARTICLES: Article[] = [
  {
    slug: "monter-de-categorie-cyclisme-open-access",
    title: "Monter de catégorie en cyclisme : Access, Open, Élite, et combien de points il faut",
    description:
      "Les seuils de points et de victoires pour passer d'Access 3 à Access 2, d'Open 3 à Open 2, d'Open 1 à Élite — et comment savoir où vous en êtes sans refaire les comptes à la main.",
    date: "2026-09-15",
    minutes: 5,
    body: (
      <>
        <P>
          Depuis la réforme de 2023, une licence Compétition FFC se range en trois
          niveaux : <strong>Élite</strong>, <strong>Open 1, 2, 3</strong> et{" "}
          <strong>Access 1 à 4</strong>. Les anciennes 1ʳᵉ, 2ᵉ et 3ᵉ catégories sont devenues les
          Open ; les Pass&apos;Cyclisme sont devenus les Access. Ce qui n&apos;a pas changé : on
          monte avec des points, et on descend sur demande.
        </P>

        <H2>Les seuils, en clair</H2>
        <UL>
          <li>
            <strong>Access 4 → 3, 3 → 2, 2 → 1</strong> : <Mono>2</Mono> victoires ou{" "}
            <Mono>25</Mono> points dans la saison. La montée est immédiate.
          </li>
          <li>
            <strong>Open 3 → Open 2</strong> : <Mono>3</Mono> victoires ou <Mono>20</Mono> points.
          </li>
          <li>
            <strong>Open 2 → Open 1</strong> : <Mono>4</Mono> victoires ou <Mono>30</Mono> points.
          </li>
          <li>
            <strong>Open 1 → Élite</strong> : <Mono>3</Mono> victoires ou <Mono>30</Mono> points —
            mais il n&apos;y a plus de montée automatique vers Élite, c&apos;est le comité qui décide.
          </li>
        </UL>
        <P>
          Le barème d&apos;une course régionale est <Mono>6 · 4 · 3 · 2 · 1</Mono> pour les cinq
          premiers. Une victoire vaut donc un quart du chemin vers Open 2 ; deux places de deuxième
          en valent presque autant. Les règles exactes sont celles de votre comité régional — les
          chiffres ci-dessus sont ceux du Titre II tel qu&apos;appliqué en 2025, et ils varient peu
          d&apos;une région à l&apos;autre.
        </P>

        <H2>Redescendre</H2>
        <P>
          La descente se demande entre le <Mono>1ᵉʳ novembre</Mono> et le{" "}
          <Mono>31 décembre</Mono>, d&apos;une seule catégorie par saison, et seulement sans
          points marqués. Un Open 1 redescend au mieux en Open 2. À l&apos;inverse, un coureur qui
          a demandé sa descente remonte dès une victoire ou 25 points.
        </P>

        <H2>Savoir où vous en êtes</H2>
        <P>
          Le compte se fait sur les résultats publiés par la fédération, que personne ne lit en
          entier. PelotonFR les relit chaque nuit : sur votre page{" "}
          <Link href="/profil" className="text-primary underline underline-offset-4">Profil</Link>,
          le compteur dit « <Mono>41</Mono> points, il en manque <Mono>31</Mono> pour Open 2 » et
          combien de victoires font le même chemin. Et si la saison est faite, la{" "}
          <Link href="/profil/lettre" className="text-primary underline underline-offset-4">
            lettre de descente
          </Link>{" "}
          est déjà rédigée.
        </P>
      </>
    ),
  },
  {
    slug: "reconnaitre-un-circuit-de-course-sans-y-aller",
    title: "Reconnaître un circuit de course sans y aller : bosses, vent, revêtement",
    description:
      "Ce qu'un directeur sportif lit sur un circuit avant le départ — la bosse multipliée par les tours, la portion exposée au vent, la route qui casse — et comment le lire depuis chez vous.",
    date: "2026-09-15",
    minutes: 6,
    body: (
      <>
        <P>
          Une course amateur, c&apos;est une boucle de <Mono>5</Mono> à <Mono>15 km</Mono> autour
          d&apos;un village, courue dix ou douze fois. La reconnaissance sur place se fait
          l&apos;hiver, quand on peut. Le reste de l&apos;année, on lit le circuit. Voici ce
          qu&apos;un DS regarde, dans l&apos;ordre.
        </P>

        <H2>La bosse fois le nombre de tours</H2>
        <P>
          Le dénivelé brut ne dit rien. Une côte de <Mono>800 m</Mono> à <Mono>5 %</Mono> se
          passe une fois ; passée douze fois, elle fait la sélection à partir du huitième tour.
          Les attaques les plus payantes partent dans les rampes, et les meilleurs sortent{" "}
          <em>avant</em> le sommet : c&apos;est là qu&apos;il faut être placé, pas au pied.
        </P>

        <H2>La portion exposée</H2>
        <P>
          Un vent de trois quarts sur une ligne droite dégagée pendant quelques minutes, et une
          équipe qui accélère : la bordure. Un mètre concédé et le vent s&apos;engouffre. La
          question à se poser la veille est : <em>où</em> le circuit est-il exposé, et{" "}
          <em>dans quel sens</em> soufflera le vent à l&apos;heure de course — pas à 8 h, il est
          plus faible le matin.
        </P>

        <H2>La route elle-même</H2>
        <P>
          Largeur, revêtement, gravillons dans les virages, bas-côtés : une route étroite qui
          rétrécit avant la bosse fait la course avant la bosse. Les photos de rue libres
          (Panoramax, Mapillary) montrent tout ça, mais il faut les regarder dans le sens de la
          course, virage par virage.
        </P>

        <H2>Ce que le site fait de tout ça</H2>
        <P>
          Sur chaque{" "}
          <Link href="/calendrier" className="text-primary underline underline-offset-4">
            fiche de course
          </Link>{" "}
          dont le circuit est connu, PelotonFR trace la boucle, compte les bosses par tour, pose
          la prévision de vent sur le tracé et lit les photos de la route dans le sens de course.
          Le circuit vient d&apos;un coureur qui l&apos;a déjà roulé : c&apos;est pour ça que{" "}
          <Link href="/profil" className="text-primary underline underline-offset-4">
            relier Strava
          </Link>{" "}
          sert à tout le peloton, pas seulement à vous.
        </P>
      </>
    ),
  },
  {
    slug: "calendrier-courses-cyclistes-ffc-fsgt-ufolep",
    title: "Le calendrier des courses cyclistes 2026 : FFC, FSGT et UFOLEP au même endroit",
    description:
      "Trois fédérations, trois sites, aucun ne lit les autres. Comment trouver toutes les courses près de chez vous, avec les engagés, la date de clôture et le circuit.",
    date: "2026-09-15",
    minutes: 4,
    body: (
      <>
        <P>
          Un coureur licencié FFC court aussi en UFOLEP le samedi et en FSGT quand le calendrier
          est vide. Trois fédérations, trois calendriers, trois formats, et aucun ne mentionne les
          deux autres. Le dimanche se choisit donc en trois onglets et un groupe WhatsApp.
        </P>

        <H2>Ce qu&apos;un calendrier devrait dire</H2>
        <UL>
          <li>La date, le lieu, l&apos;heure de départ et les catégories admises.</li>
          <li>La date de clôture des engagements — en FFC, c&apos;est le club qui engage, et un
            responsable prévenu deux jours trop tard, c&apos;est un dimanche sans course.</li>
          <li>Les engagés déjà inscrits, pour savoir contre qui.</li>
          <li>Le circuit, et ce qu&apos;il fera aux jambes au dixième tour.</li>
          <li>Les éditions passées : qui a gagné, combien ont fini.</li>
        </UL>

        <H2>Comment PelotonFR le construit</H2>
        <P>
          Chaque nuit, le site relit les trois calendriers fédéraux, les listes d&apos;engagés
          publiées, les résultats et les fiches organisateur, puis relie chaque course à son
          édition de l&apos;an dernier. Le résultat est{" "}
          <Link href="/calendrier?vue=carte" className="text-primary underline underline-offset-4">
            une carte
          </Link>{" "}
          et{" "}
          <Link href="/departement" className="text-primary underline underline-offset-4">
            une page par département
          </Link>
          , filtrables par catégorie et par distance depuis chez vous. Une{" "}
          <Link href="/alertes" className="text-primary underline underline-offset-4">alerte</Link>{" "}
          prévient quand une course entre dans vos critères, et deux jours avant la clôture.
        </P>
        <P>
          C&apos;est gratuit, sans publicité, et fait par un coureur amateur qui en avait assez
          des trois onglets.
        </P>
      </>
    ),
  },
];

export function getArticle(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}

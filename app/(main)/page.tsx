import { requestTime } from "@/lib/request-time";
import { todayISO } from "@/lib/date";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, Users } from "lucide-react";
import { RouteIllustration } from "@/components/brand/RouteIllustration";
import { RaceCard } from "@/components/races/RaceCard";
import { HomeSearch } from "@/components/races/HomeSearch";
import { getUpcomingRaces, getRaceStats } from "@/lib/db/queries/races";
import type { Race } from "@/types";
import type { RaceStats } from "@/lib/db/queries/races";

export const revalidate = 300;
/* Le titre que Google affiche n'est pas la devise du site. « Ta prochaine
   course commence ici » ne contient aucun des mots qu'un coureur tape ; il
   reste la devise, en gros, sur la page et dans les partages. Ici, ce sont
   les trois fédérations et le mot « courses cyclistes ». */
export const metadata = {
  title: "Courses cyclistes FFC, FSGT et UFOLEP",
  alternates: { canonical: "/" },
};

/**
 * Qui publie ce site, et comment on y cherche.
 *
 * `WebSite` avec son action de recherche, c'est ce qui permet à Google
 * d'afficher un champ de recherche sous le nom du site dans ses résultats, et
 * `Organization` de rattacher toutes les pages à un même éditeur plutôt qu'à
 * un domaine anonyme.
 */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${CANONICAL_SITE_URL}/#site`,
      url: CANONICAL_SITE_URL,
      name: "PelotonFR",
      inLanguage: "fr-FR",
      description:
        "Le calendrier du cyclisme amateur français : courses FFC, FSGT et UFOLEP, parcours, engagés et météo au départ.",
      publisher: { "@id": `${CANONICAL_SITE_URL}/#editeur` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${CANONICAL_SITE_URL}/calendrier?vue=liste&q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${CANONICAL_SITE_URL}/#editeur`,
      name: "PelotonFR",
      url: CANONICAL_SITE_URL,
      logo: `${CANONICAL_SITE_URL}/apple-icon.png`,
      areaServed: { "@type": "Country", name: "France" },
    },
  ],
};

export default async function HomePage() {
  let upcomingRaces: Race[] = [];
  let stats: RaceStats | null = null;
  let unavailable = false;
  try { [upcomingRaces, stats] = await Promise.all([getUpcomingRaces(6), getRaceStats()]); }
  catch { unavailable = true; }
  return <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
    <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }} />
    <section className="home-hero">
      <div>
        <p className="home-kicker mb-5 flex items-center gap-3"><span className="size-2 rounded-full bg-highlight" /> LE RENDEZ-VOUS DES COUREURS</p>
        <h1 className="home-title mb-6">TA PROCHAINE COURSE<br />EST POUR TOI.</h1>
        <p className="max-w-lg text-base sm:text-lg leading-relaxed text-muted-foreground">Les courses près de chez toi. Les infos pour arriver prêt.<br className="hidden sm:block" /> Ta saison, et ceux avec qui tu la partages.</p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link href="/calendrier" className="inline-flex min-h-12 items-center gap-6 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Trouver ma prochaine course <ArrowUpRight className="size-4" /></Link>
          <Link href="#rendez-vous" className="text-sm underline underline-offset-4">Explorer sans compte</Link>
        </div>
        <div className="mt-8 flex flex-wrap gap-5 font-mono text-xs text-muted-foreground" role="group" aria-label="Fédérations référencées">
          <Link href="/calendrier?vue=liste&fed=ffc" className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-ffc" />FFC</Link>
          <Link href="/calendrier?vue=liste&fed=fsgt" className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-fsgt" />FSGT</Link>
          <Link href="/calendrier?vue=liste&fed=ufolep" className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-ufolep" />UFOLEP</Link>
        </div>
      </div>
      <RouteIllustration />
    </section>
    <section aria-label="Rechercher autour de chez soi" className="grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-[1fr_1fr] sm:items-center">
      <div><p className="home-kicker text-muted-foreground">ÇA COMMENCE PRÈS DE CHEZ TOI</p><h2 className="mt-1 font-heading text-3xl font-bold">On se retrouve où ?</h2></div>
      <HomeSearch />
    </section>
    <div className="my-7 flex flex-wrap justify-between gap-4 border-b pb-7 text-xs text-muted-foreground">
      <span><strong className="font-mono text-foreground">3 FÉDÉRATIONS</strong> réunies</span>
      <span>Des sources identifiées sur les fiches</span>
      <span>Le calendrier en accès libre</span>
      {stats && <span><strong className="font-mono text-foreground">{stats.total.toLocaleString("fr-FR")}</strong> courses à venir référencées</span>}
    </div>
    <section id="rendez-vous" className="scroll-mt-24 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="home-kicker mb-2 text-muted-foreground">LE CALENDRIER / LES PROCHAINS DÉPARTS</p><h2 className="font-heading text-4xl font-bold">Ton prochain dimanche.</h2></div><Link href="/calendrier" className="inline-flex items-center gap-2 text-sm underline underline-offset-4">Tout le calendrier <ArrowUpRight className="size-4" /></Link></div>
      {unavailable ? <div role="status" className="rounded-xl border p-6">Les prochaines courses ne peuvent pas être chargées pour le moment. Réessaie dans quelques instants.</div> : upcomingRaces.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{upcomingRaces.map(race=><RaceCard key={race.id} race={race} nowMs={requestTime()} today={todayISO()} />)}</div> : <p className="rounded-xl border p-6 text-muted-foreground">Aucune prochaine course n’est encore référencée. Reviens après la prochaine mise à jour du calendrier.</p>}
    </section>
    <section className="grid gap-10 border-t my-12 pt-12 pb-5 md:grid-cols-2">
      <div><p className="home-kicker mb-3 text-muted-foreground">PLUS QU’UNE DATE DANS LE CALENDRIER</p><h2 className="font-heading text-5xl font-bold leading-none">LE DIMANCHE<br />SE PRÉPARE ICI.</h2><p className="mt-5 max-w-md leading-relaxed text-muted-foreground">Une course, c’est un lieu à rejoindre, une inscription à ne pas manquer et un parcours à comprendre. Retrouve l’essentiel, puis construis ta saison à ton rythme.</p><Link href="/ma-saison" className="mt-6 inline-flex items-center gap-3 rounded-full border px-5 py-3 text-sm font-bold">Préparer ma saison <ArrowUpRight className="size-4" /></Link></div>
      <div className="space-y-1">{[
        { icon: MapPin, title: "Trouve les courses qui te vont.", description: "Lieu, catégorie, fédération : pars de tes envies et de tes contraintes.", href: "/calendrier" },
        { icon: CalendarDays, title: "Arrive avec les bonnes infos.", description: "Départ, engagements, circuit : consulte la fiche et sa source officielle.", href: "/calendrier?vue=liste" },
        { icon: Users, title: "Construis ta saison avec ton club.", description: "Envisagées ou programmées : les courses de l’équipe au même endroit.", href: "/club" },
      ].map((feature,index)=><Link key={feature.title} href={feature.href} className="flex gap-5 rounded-xl p-5 hover:bg-surface-2"><span className="font-mono text-sm text-accent">0{index+1}</span><div><h3 className="flex items-center gap-2 font-bold"><feature.icon className="size-4 shrink-0" />{feature.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p></div></Link>)}</div>
    </section>
  </div>;
}

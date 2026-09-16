import { requestTime } from "@/lib/request-time";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { RaceCard } from "@/components/races/RaceCard";
import { StravaInvite } from "@/components/strava/StravaInvite";
import { EmptyState } from "@/components/common/States";
import {
  getDepartment,
  getDepartmentRaces,
  getDepartmentTowns,
  listDepartments,
} from "@/lib/db/queries/departments";
import { todayISO } from "@/lib/date";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ code: string }>;
}

/** « en Sarthe », « dans le Nord », « à Paris » : la préposition suit le nom. */
function inDepartment(name: string): string {
  if (name === "Paris") return "à Paris";
  if (/^(Nord|Rhône|Var|Gard|Cher|Lot|Tarn|Gers|Jura|Doubs|Loiret|Morbihan|Finistère|Calvados|Cantal|Bas-Rhin|Haut-Rhin|Puy-de-Dôme|Pas-de-Calais|Territoire de Belfort|Val-d'Oise|Val-de-Marne|Loir-et-Cher|Maine-et-Loire|Lot-et-Garonne|Tarn-et-Garonne)$/.test(name)) {
    return `dans le ${name}`;
  }
  if (/^(Ain|Aisne|Allier|Aude|Aveyron|Eure|Hérault|Indre|Orne|Oise|Yonne|Ardèche|Ariège|Aube)$/.test(name)) {
    return `dans l'${name}`;
  }
  if (/^(Alpes|Ardennes|Bouches|Côtes|Deux|Hautes|Hauts|Landes|Pyrénées|Vosges|Yvelines)/.test(name)) {
    return `dans les ${name}`;
  }
  if (/^La /.test(name)) return `à ${name}`;
  return `en ${name}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const d = await getDepartment(code);
  if (!d) return { title: "Département inconnu" };
  const year = new Date().getFullYear();
  return {
    title: `Courses cyclistes ${inDepartment(d.name)} (${d.code}) — calendrier ${year}`,
    description: `${d.upcoming} course${d.upcoming > 1 ? "s" : ""} cycliste${d.upcoming > 1 ? "s" : ""} à venir ${inDepartment(d.name)} : FFC, FSGT et UFOLEP, avec les dates, les catégories, les engagés et le circuit quand il est connu.`,
    alternates: { canonical: `/departement/${d.code}` },
  };
}

export async function generateStaticParams() {
  try {
    return (await listDepartments()).map((d) => ({ code: d.code }));
  } catch {
    return [];
  }
}

/**
 * La page qu'un coureur trouve en cherchant « course cycliste » et chez lui.
 *
 * Elle dit ce que le département court, montre ce qui vient, et propose de
 * relier Strava — c'est un coureur de ce département, sur ses routes, qui
 * fera exister les circuits du département.
 */
export default async function DepartementPage({ params }: PageProps) {
  const { code } = await params;
  const d = await getDepartment(code);
  if (!d) notFound();

  const [races, towns] = await Promise.all([
    getDepartmentRaces(code),
    getDepartmentTowns(code),
  ]);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const feds = new Set(races.map((r) => r.federationSlug));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/departement" className="hover:text-foreground">Départements</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono tabular-nums">{d.code}</span>
      </nav>

      <header className="mb-8">
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="size-5 text-primary" />
          <h1 className="font-heading text-3xl font-bold">
            Courses cyclistes {inDepartment(d.name)}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {d.upcoming > 0 ? (
            <>
              <span className="font-mono tabular-nums text-foreground">{d.upcoming}</span> course
              {d.upcoming > 1 ? "s" : ""} à venir en {year}
              {feds.size > 0 && <> ({[...feds].map((f) => f.toUpperCase()).join(", ")})</>}
              {d.withTrace > 0 && (
                <>
                  , dont <span className="font-mono tabular-nums text-foreground">{d.withTrace}</span> avec le circuit
                </>
              )}
              .
            </>
          ) : (
            <>Aucune course annoncée pour l&apos;instant.</>
          )}{" "}
          {d.since && d.since < year && d.total > d.upcoming && (
            <>
              Le site connaît <span className="font-mono tabular-nums text-foreground">{d.total}</span> éditions
              {" "}depuis {d.since}
              {towns.length > 0 && <> — surtout à {towns.slice(0, 5).join(", ")}</>}.
            </>
          )}
        </p>
      </header>

      {races.length === 0 ? (
        <EmptyState
          title={`Aucune course à venir ${inDepartment(d.name)}`}
          action="Les calendriers fédéraux sont relus chaque nuit ; élargissez aux départements voisins en attendant."
        >
          <Link href="/calendrier?vue=carte" className="text-sm font-medium text-primary underline underline-offset-4">
            Ouvrir la carte
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {races.map((race) => (
            <RaceCard key={race.id} race={race} nowMs={requestTime()} today={today} />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/calendrier?vue=carte" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          Voir sur la carte
          <ArrowRight className="size-3.5" />
        </Link>
        <Link href="/departement" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          Autres départements
        </Link>
      </div>

      <div className="mt-10">
        <StravaInvite compact />
      </div>
    </div>
  );
}

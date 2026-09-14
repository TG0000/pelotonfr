import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { listDepartments } from "@/lib/db/queries/departments";

export const metadata: Metadata = {
  title: "Courses cyclistes par département",
  description:
    "Le calendrier des courses cyclistes FFC, FSGT et UFOLEP, département par département : dates, lieux, catégories et circuits.",
};

export const revalidate = 3600;

/**
 * Un département, une page.
 *
 * C'est la première chose qu'un coureur tape dans un moteur de recherche :
 * « course cycliste » et le nom de chez lui. Cette liste est l'entrée de
 * ces pages, et le plan du site les connaît toutes.
 */
export default async function DepartementsPage() {
  let departments: Awaited<ReturnType<typeof listDepartments>> = [];
  try {
    departments = await listDepartments();
  } catch {
    // Sans base, la liste est vide et le dit.
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="size-5 text-primary" />
          <h1 className="font-heading text-3xl font-bold">Courses cyclistes par département</h1>
        </div>
        <p className="text-muted-foreground">
          FFC, FSGT et UFOLEP réunies. Chaque page donne les courses à venir du département,
          leurs catégories, et le circuit quand il est connu.
        </p>
      </header>

      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun département n&apos;a encore de course enregistrée.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <li key={d.code}>
              <Link
                href={`/departement/${d.code}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-surface-2"
              >
                <span className="truncate">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{d.code}</span>{" "}
                  <span className="font-medium">{d.name}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {d.upcoming > 0 ? `${d.upcoming} à venir` : `${d.total} connues`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

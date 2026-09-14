import { Ruler } from "lucide-react";
import { fetchRoadFeatures, readRoad, type RoadReport } from "@/lib/road";
import type { RaceTrace } from "@/lib/db/queries/race-detail";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * La route sous le tracé, telle que l'IGN la mesure.
 *
 * Largeur de chaussée, nature, statut, mètre par mètre le long du tour. Ce
 * n'est pas l'état du bitume — ça, personne ne le publie — mais c'est déjà
 * la réponse à « ça passe à combien de large » et « il y a du chemin ».
 */
export async function getRoadReport(trace: RaceTrace): Promise<RoadReport | null> {
  try {
    const features = await fetchRoadFeatures(trace.bounds);
    return readRoad(trace.points, features);
  } catch {
    return null;
  }
}

function km(m: number): string {
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

export function RaceRoad({ report }: { report: RoadReport | null }) {
  if (!report) return null;
  const shown = report.stretches.slice(0, 6);

  return (
    <section>
      <SectionHeading icon={Ruler}>
        La route
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          largeur et nature, lues sur la BD TOPO de l&rsquo;IGN
        </span>
      </SectionHeading>
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <p className="mb-3 text-sm">{report.verdict}</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="au plus étroit" value={report.minWidthM != null ? `${report.minWidthM} m` : "?"} />
          <Stat label="sous 4,5 m" value={km(report.narrowM)} warn={report.narrowM > report.totalM * 0.2} />
          <Stat label="hors bitume" value={km(report.unpavedM)} warn={report.unpavedM > 0} />
        </div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1 font-medium">Route</th>
              <th className="pb-1 font-medium">Nature</th>
              <th className="pb-1 text-right font-medium">Largeur</th>
              <th className="pb-1 text-right font-medium">Sur le tour</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={`${s.label}-${s.widthM}-${s.lengthM}`} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  {s.label}
                  {s.classement && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.classement.toLowerCase()}</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-muted-foreground">
                  {s.nature.toLowerCase()}{s.urban ? ", en agglomération" : ""}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {s.widthM != null ? `${s.widthM} m` : "–"}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">{km(s.lengthM)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          L&rsquo;IGN mesure la chaussée, pas son état. Gravillons, enrobé refait,
          bas-côtés sales : si tu l&rsquo;as roulée, dis-le avec « Une info manque »
          en haut de page, choix « La route ».
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className={cn("font-mono text-lg tabular-nums", warn && "text-accent")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

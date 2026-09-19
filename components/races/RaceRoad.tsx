import { Ruler } from "lucide-react";
import { fetchRoadFeatures, readRoad, type RoadReport } from "@/lib/road";
import type { RaceTrace } from "@/lib/db/queries/race-detail";
import { SectionHeading } from "./StartList";
import type { RoadView } from "@/lib/db/queries/road";
import { hazardsAlong, blindSpots, textureVerdict, recentCutoff, seenSentence, readablePictures, type RoadSeen } from "@/lib/road-vision";
import { detectLaps } from "@/lib/trace";
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
    /* Un tour, pas l'enregistrement entier. Le tableau s'intitule « sur le
       tour » et chacun de ses kilomètres était multiplié par le nombre de
       tours : à Giberville, quarante-deux tours de deux kilomètres donnaient
       « Rue Pasteur 41,6 km » pour un kilomètre de rue, et la même rue
       apparaissait plusieurs fois. Les pourcentages, eux, tenaient. */
    const lap = detectLaps(trace.points).lap ?? trace.points;
    const lngs = lap.map((p) => p[0]);
    const lats = lap.map((p) => p[1]);
    const bounds = {
      west: Math.min(...lngs),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      north: Math.max(...lats),
    };
    const features = await fetchRoadFeatures(bounds);
    return readRoad(lap, features);
  } catch {
    return null;
  }
}

function km(m: number): string {
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Street View au point donné, sans clé ni compte : un lien vers Google Maps. */
function streetViewLink(lat: number, lng: number, heading: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}&heading=${heading}&pitch=0&fov=90`;
}

export function RaceRoad({
  report,
  views = [],
  seen = null,
  trace = null,
}: {
  report: RoadReport | null;
  views?: RoadView[];
  seen?: RoadSeen | null;
  trace?: RaceTrace | null;
}) {
  if (!report && views.length === 0) return null;
  const shown = report?.stretches.slice(0, 6) ?? [];
  const readable = readablePictures(views);
  // Les dangers viennent des mêmes photos que le reste du panneau : afficher
  // le danger d'une photo qu'on refuse de montrer se contredit tout seul.
  const hazards = hazardsAlong(readable);
  const grain = textureVerdict(views);
  // Composant serveur : la date est lue une fois au rendu, pas à chaque ligne.
  const cutoff = recentCutoff();

  /* Là où l'on est aveugle : les portions du tour sans photo, avec le point
     du milieu et son cap, pour aller voir ailleurs. */
  const lap = trace ? (detectLaps(trace.points).lap ?? trace.points) : null;
  const lapM = lap ? lap[lap.length - 1][3] : 0;
  const blind = lap && readable.length > 0 ? blindSpots(readable, lapM) : [];
  const at = (m: number) => {
    if (!lap) return null;
    let i = lap.findIndex((p) => p[3] >= m);
    if (i < 0) i = lap.length - 1;
    const a = lap[Math.max(0, i - 2)], b = lap[Math.min(lap.length - 1, i + 2)];
    const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
    const heading = Math.round(((Math.atan2(dLng, b[1] - a[1]) * 180) / Math.PI + 360) % 360);
    return { lat: lap[i][1], lng: lap[i][0], heading };
  };
  const latestIso = readable.map((v) => v.takenOn ?? "").filter(Boolean).sort().at(-1);
  const latest = latestIso
    ? new Date(`${latestIso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <section>
      <SectionHeading icon={Ruler}>
        La route
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          largeur et nature, lues sur la BD TOPO de l&rsquo;IGN
        </span>
      </SectionHeading>
      {readable.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-surface-1 p-4">
          <p className="mb-3 text-sm">
            {/* Trois cas, et pas deux : lu et remarquable, lu et ordinaire,
                pas lu du tout. La phrase de repli affirmait « enrobé ordinaire
                en bon état » y compris quand aucune photo n'avait été lue. */}
            {seenSentence(seen ?? null)}
            {grain && <> {grain}</>}
            <span className="text-muted-foreground"> D&rsquo;après {readable.length} photo{readable.length > 1 ? "s" : ""} prise{readable.length > 1 ? "s" : ""} sur la boucle.</span>
          </p>
          {hazards.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {hazards.map((h, i) => (
                <li key={`${h.alongM}-${h.kind}-${i}`} className="flex items-baseline gap-2">
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", h.severity >= 3 ? "bg-destructive" : h.severity === 2 ? "bg-accent" : "bg-muted-foreground")} aria-hidden />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">km {(h.alongM / 1000).toFixed(1).replace(".", ",")}</span>
                  <span className="font-medium">{h.kind}</span>
                  {h.note && <span className="text-muted-foreground">{h.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {readable.map((v) => (
              <a
                key={v.pictureId}
                href={`https://api.panoramax.xyz/#focus=pic&pic=${v.pictureId}`}
                target="_blank"
                rel="noreferrer"
                className="w-44 shrink-0"
                title={v.reading?.note ?? undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.hasCrop ? `/api/road-view/${v.pictureId}.jpg` : v.url} alt={v.reading?.note ?? "Photo de la route"} loading="lazy" decoding="async" width={176} height={112} className="h-28 w-44 rounded-lg border border-border object-cover" />
                <div className="mt-1 text-xs">
                  <span className="font-mono tabular-nums text-muted-foreground">km {((v.alongM ?? 0) / 1000).toFixed(1).replace(".", ",")}</span>{" "}
                  {v.reading?.surface}
                  {v.reading?.condition && v.reading.condition !== "bon" && v.reading.condition !== "inconnu" ? `, ${v.reading.condition}` : ""}
                  {v.reading?.looseGravel ? ", gravillons" : ""}
                  {v.reading?.texture != null && (v.takenOn ?? "") >= cutoff && (
                    <span className="text-muted-foreground"> · grain {v.reading.texture}/5</span>
                  )}
                  {v.reading?.coverLeft && v.reading?.coverRight && (v.orientation === "avant" || v.orientation === "arrière") && (
                    <div className="text-muted-foreground">
                      G {v.orientation === "arrière" ? v.reading.coverRight : v.reading.coverLeft} · D {v.orientation === "arrière" ? v.reading.coverLeft : v.reading.coverRight}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
          {blind.length > 0 && (
            <p className="mt-3 text-sm">
              <span className="font-medium">Sans photo</span>
              <span className="text-muted-foreground"> : </span>
              {blind.map((b, i) => {
                /* Le trou qui enjambe la ligne d'arrivée va de 5,0 à 0,9 :
                   la moyenne des deux bornes tombe au milieu de la partie
                   photographiée, à l'opposé du trou. */
                const midM =
                  b.fromM <= b.toM
                    ? (b.fromM + b.toM) / 2
                    : ((b.fromM + (b.toM + lapM)) / 2) % lapM;
                const mid = at(midM);
                const label = `km ${(b.fromM / 1000).toFixed(1).replace(".", ",")} → ${(b.toM / 1000).toFixed(1).replace(".", ",")}`;
                return (
                  <span key={`${b.fromM}-${b.toM}`}>
                    {i > 0 && ", "}
                    {mid ? (
                      <a href={streetViewLink(mid.lat, mid.lng, mid.heading)} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2" title="Ouvrir Street View à cet endroit">
                        {label}
                      </a>
                    ) : label}
                  </span>
                );
              })}
              <span className="text-muted-foreground"> — personne n&rsquo;y a roulé caméra ouverte ; le lien ouvre Street View à cet endroit.</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Photos Panoramax, prises par des contributeurs{latest ? ` (la plus récente en ${latest})` : ""}, lues une fois par vision dans le sens de la course (G et D : ce qui borde à gauche et à droite du coureur). La route a pu être refaite depuis.
          </p>
        </div>
      )}
      {report && (
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
          L&rsquo;IGN mesure la chaussée ; les photos disent l&rsquo;état. Si tu l&rsquo;as
          roulée depuis et que ça a changé, dis-le avec « Une info manque », choix « La route ».
        </p>
      </div>
      )}
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

import { Flag, Timer } from "lucide-react";
import { getRaceStages, getRaceStageTraces, type StageTrace } from "@/lib/db/queries/race-detail";
import { ElevationProfile } from "./ElevationProfile";
import { Download } from "lucide-react";
import { SectionHeading } from "./StartList";
import { displayRaceName } from "@/lib/race-name";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Les étapes d'un tour.
 *
 * La fédération enregistre le Tour de l'Orne comme une seule ligne de
 * calendrier, du 12 au 13 septembre, et range ses trois étapes dans un
 * paragraphe de texte libre. Un coureur qui s'y engage prépare pourtant trois
 * parcours : deux courses en ligne et un contre-la-montre de treize
 * kilomètres. C'est la course de l'année qui demande la préparation la plus
 * longue, et jusqu'ici c'était la moins bien décrite.
 */
export async function RaceStages({ raceId }: { raceId: string }) {
  let stages: Awaited<ReturnType<typeof getRaceStages>> = [];
  let traces: StageTrace[] = [];
  try {
    [stages, traces] = await Promise.all([getRaceStages(raceId), getRaceStageTraces(raceId).catch(() => [])]);
  } catch {
    return null;
  }

  // Un guide peut décrire une étape que la fédération n'a pas détaillée :
  // elle apparaît quand même, avec son parcours.
  for (const t of traces) {
    if (!stages.some((s) => s.number === t.stageNumber)) {
      stages.push({ number: t.stageNumber, day: null, from: null, to: null, distanceKm: null, kind: null });
    }
  }
  stages.sort((a, b) => a.number - b.number);
  const traceOf = (n: number) => traces.find((t) => t.stageNumber === n) ?? null;

  if (stages.length < 2 && traces.length === 0) return null;

  const total = stages.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);

  /** 103,5 km. Une feuille de résultats française n'écrit pas 103.5. */
  const km = (value: number) =>
    value.toFixed(value % 1 === 0 ? 0 : 1).replace(".", ",");

  return (
    <section>
      <SectionHeading icon={Flag}>
        Les étapes
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {stages.length} étapes
          {total > 0 && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">{km(total)}</span> km
              au total
            </>
          )}
        </span>
      </SectionHeading>

      <ol className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-surface-1">
        {stages.map((stage) => (
          <li key={stage.number} className="flex items-center gap-3 px-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-sm tabular-nums text-muted-foreground">
              {stage.number}
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {stage.from && stage.to ? (
                  stage.from.toLowerCase() === stage.to.toLowerCase() ? (
                    // Départ et arrivée au même endroit : le dire une fois.
                    displayRaceName(stage.from)
                  ) : (
                    <>
                      {displayRaceName(stage.from)}
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      {displayRaceName(stage.to)}
                    </>
                  )
                ) : (
                  `Étape ${stage.number}`
                )}
              </div>

              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {stage.day && (
                  <span className="font-mono tabular-nums">
                    {format(new Date(`${stage.day}T12:00:00`), "EEE d MMM", {
                      locale: fr,
                    })}
                  </span>
                )}
                {stage.kind === "clm" && (
                  <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                    <Timer className="size-3" />
                    Contre-la-montre
                  </span>
                )}
              </div>
            </div>

            {stage.distanceKm !== null && (
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {km(stage.distanceKm)} km
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Les parcours reconstruits depuis le guide technique : points de
          passage placés, reliés par la route, relief relu. Une
          reconstruction, pas un relevé, et la page le dit. */}
      {traces.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {stages.map((stage) => {
            const t = traceOf(stage.number);
            if (!t) return null;
            return (
              <div key={stage.number} className="rounded-xl border border-border bg-surface-1 p-4">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">Étape {stage.number}</span>
                  <span className="font-mono tabular-nums">{km(t.distanceM / 1000)} km</span>
                  <span className="font-mono tabular-nums">{t.elevationGainM} m D+</span>
                  <span className="text-muted-foreground">altitude {t.minElevationM}–{t.maxElevationM} m</span>
                  <a
                    href={`/api/course/${raceId}/gpx?etape=${stage.number}`}
                    download
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  >
                    <Download className="size-3" /> GPX
                  </a>
                </div>
                <ElevationProfile points={t.points} minElevationM={t.minElevationM} maxElevationM={t.maxElevationM} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Parcours reconstruit depuis le guide technique : {t.waypoints.length} points de passage placés et reliés par la route
                  {t.guideKm != null ? `, ${km(t.guideKm)} km annoncés` : ""}. Une reconstruction, pas un relevé : les rues du départ et de l&rsquo;arrivée peuvent différer.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

import { ClipboardList, Clock, MapPin, RotateCw } from "lucide-react";
import { SectionHeading } from "./StartList";

/**
 * What the organiser wrote, said as the organiser said it.
 *
 * Everything else on this page is inferred — the start time from the category
 * and the distance, the circuit from Strava's segments, the field from who
 * raced nearby. This is the one panel where the organiser speaks, so it says
 * so plainly and does not round, reword or average anything.
 *
 * It appears only when there is something to say, which is a minority of races:
 * about a third state where dossards are collected, one in twenty states the
 * circuit. An empty panel would suggest the organiser said nothing when in
 * truth we never asked.
 */
export function OrganiserBriefing({
  bibPickupTime,
  bibPickupPlace,
  startTime,
  circuitM,
  lapCount,
}: {
  bibPickupTime: string | null;
  bibPickupPlace: string | null;
  /** Le premier départ de la réunion — pas forcément celui de cette course. */
  startTime: string | null;
  circuitM: number | null;
  lapCount: number | null;
}) {
  const hasPickup = Boolean(bibPickupTime || bibPickupPlace);
  if (!hasPickup && !circuitM && !startTime) return null;

  const total =
    circuitM && lapCount ? (circuitM * lapCount) / 1000 : null;

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface-1 p-4">
      <SectionHeading icon={ClipboardList}>
        L&apos;organisateur annonce
      </SectionHeading>

      <dl className="flex flex-col gap-3 text-sm">
        {circuitM && (
          <div className="relative pl-7">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground"><RotateCw aria-hidden className="absolute left-0 top-0.5 size-4" />Circuit</dt>
              <dd>
                <span className="font-mono tabular-nums">
                  {(circuitM / 1000).toFixed(1)} km
                </span>
                {lapCount && (
                  <>
                    {" à parcourir "}
                    <span className="font-mono tabular-nums">{lapCount}</span>
                    {" fois"}
                  </>
                )}
                {total && (
                  <span className="text-muted-foreground">
                    {" — soit "}
                    <span className="font-mono tabular-nums">
                      {total.toFixed(1)} km
                    </span>
                  </span>
                )}
              </dd>
          </div>
        )}

        {startTime && (
          <div className="relative pl-7">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                <Clock aria-hidden className="absolute left-0 top-0.5 size-4" />Premier départ de la réunion
              </dt>
              <dd className="font-mono tabular-nums">{startTime}</dd>
          </div>
        )}

        {hasPickup && (
          <div className="relative pl-7">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                <MapPin aria-hidden className="absolute left-0 top-0.5 size-4" />Remise des dossards
              </dt>
              <dd>
                {bibPickupTime && (
                  <span className="font-mono tabular-nums">
                    {bibPickupTime}
                  </span>
                )}
                {bibPickupTime && bibPickupPlace && " — "}
                {bibPickupPlace}
              </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

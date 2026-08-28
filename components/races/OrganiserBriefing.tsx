import { ClipboardList, MapPin, RotateCw } from "lucide-react";
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
  circuitM,
  lapCount,
}: {
  bibPickupTime: string | null;
  bibPickupPlace: string | null;
  circuitM: number | null;
  lapCount: number | null;
}) {
  const hasPickup = Boolean(bibPickupTime || bibPickupPlace);
  if (!hasPickup && !circuitM) return null;

  const total =
    circuitM && lapCount ? (circuitM * lapCount) / 1000 : null;

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface-1 p-4">
      <SectionHeading icon={ClipboardList}>
        L&apos;organisateur annonce
      </SectionHeading>

      <dl className="flex flex-col gap-3 text-sm">
        {circuitM && (
          <div className="flex items-start gap-2.5">
            <RotateCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="sr-only">Circuit</dt>
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
          </div>
        )}

        {hasPickup && (
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Remise des dossards
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
          </div>
        )}
      </dl>
    </div>
  );
}

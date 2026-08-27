import { Mountain } from "lucide-react";
import { getTerrain, type TerrainKind } from "@/lib/terrain";
import { SectionHeading } from "./StartList";
import { cn } from "@/lib/utils";

/**
 * The ground the circuit is cut into.
 *
 * Organisers publish a profile roughly never, and the trace itself only exists
 * where someone has ridden it. The terrain, though, is public everywhere — and
 * it answers the question a rider is really asking before entering: is this an
 * afternoon in the wind, or will it go uphill often enough to matter.
 */

const TONE: Record<TerrainKind, string> = {
  "plat": "text-muted-foreground",
  "légèrement vallonné": "text-muted-foreground",
  "vallonné": "text-accent",
  "accidenté": "text-accent",
  "montagneux": "text-destructive",
};

/** How many of five bars the terrain fills. */
const STEPS: Record<TerrainKind, number> = {
  "plat": 1,
  "légèrement vallonné": 2,
  "vallonné": 3,
  "accidenté": 4,
  "montagneux": 5,
};

export async function RaceTerrain({ lat, lng }: { lat: number; lng: number }) {
  const terrain = await getTerrain(lat, lng);
  if (!terrain) return null;

  const filled = STEPS[terrain.kind];

  return (
    <section>
      <SectionHeading icon={Mountain}>
        Le terrain
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          dans 12 km autour du départ
        </span>
      </SectionHeading>

      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-4">
          <div
            className="flex items-end gap-1"
            role="img"
            aria-label={`Relief : ${terrain.kind}`}
          >
            {[1, 2, 3, 4, 5].map((step) => (
              <span
                key={step}
                className={cn(
                  "w-2 rounded-sm",
                  step <= filled ? "bg-current" : "bg-surface-3",
                  step <= filled && TONE[terrain.kind]
                )}
                style={{ height: `${8 + step * 5}px` }}
              />
            ))}
          </div>

          <div className="min-w-0">
            <div className={cn("font-semibold capitalize", TONE[terrain.kind])}>
              {terrain.kind}
            </div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              {terrain.minM}–{terrain.maxM} m · {terrain.amplitudeM} m d&apos;amplitude
            </div>
          </div>
        </div>

        <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          {terrain.verdict}
        </p>

        <p className="mt-2 text-xs text-muted-foreground/70">
          Lu depuis le relief public autour du départ, pas depuis le tracé — que
          les organisateurs publient rarement.
        </p>
      </div>
    </section>
  );
}

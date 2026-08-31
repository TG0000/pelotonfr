import Link from "next/link";
import { CalendarClock, Ban } from "lucide-react";
import { getPostponement } from "@/lib/db/queries/race-detail";

/**
 * Ce qu'il est advenu d'une course annulée.
 *
 * Une annulation sans explication laisse un coureur devant deux hypothèses
 * qu'il ne peut pas départager : la course n'a pas lieu, ou l'application a
 * perdu quelque chose. Dire quand on l'a appris, et vers quelle date l'épreuve
 * a été reprise s'il y en a une, tranche les deux.
 */
export async function CancellationNotice({
  raceId,
  cancelledAt,
}: {
  raceId: string;
  cancelledAt: string | null;
}) {
  const moved = await getPostponement(raceId);

  const learned = cancelledAt
    ? new Date(cancelledAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="mb-8 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Ban className="size-4 shrink-0 text-destructive" />
        Cette course est annulée.
        {learned && (
          <span className="font-normal text-muted-foreground">
            Signalé par la fédération le {learned}.
          </span>
        )}
      </p>

      {moved && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Le rendez-vous est reprogrammé{" "}
            {moved.days <= 14
              ? `${moved.days} jour${moved.days > 1 ? "s" : ""} plus tard`
              : "plus tard dans la saison"}{" "}
            :
          </span>
          <Link
            href={`/course/${moved.raceId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {new Date(`${moved.raceDate}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Link>
        </p>
      )}
    </div>
  );
}

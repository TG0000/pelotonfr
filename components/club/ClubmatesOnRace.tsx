import Link from "next/link";
import { Users } from "lucide-react";
import { getAuthUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getClubmatesOnRace } from "@/lib/db/queries/club";

/**
 * « Théo G. et Paul M. s'y sont inscrits. »
 *
 * Sur la course, pour un membre d'un club : qui du club y va, qui y pense.
 * Visible seulement entre coéquipiers — un calendrier personnel ne se lit
 * pas depuis l'extérieur.
 */
export async function ClubmatesOnRace({ raceId }: { raceId: string }) {
  const me = await getAuthUser();
  if (!me) return null;
  let mates = null;
  try {
    const id = await resolveUser(me.id, me.email);
    mates = await getClubmatesOnRace(raceId, id);
  } catch {
    return null;
  }
  if (!mates || (mates.going.length === 0 && mates.considering.length === 0)) return null;

  const list = (names: string[]) =>
    names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <Users className="size-4 shrink-0 text-primary" />
      <span>
        {mates.going.length > 0 && (
          <>
            <span className="font-medium">{list(mates.going)}</span>
            {mates.going.length > 1 ? " s'y sont inscrits" : " s'y est inscrit"}
          </>
        )}
        {mates.going.length > 0 && mates.considering.length > 0 && " · "}
        {mates.considering.length > 0 && (
          <>
            <span className="font-medium">{list(mates.considering)}</span>
            {mates.considering.length > 1 ? " y pensent" : " y pense"}
          </>
        )}
        <span className="text-muted-foreground"> — {mates.clubName}</span>
      </span>
      <Link href="/club" className="ml-auto text-xs text-primary hover:underline">Le calendrier du club →</Link>
    </div>
  );
}

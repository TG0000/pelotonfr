import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sql } from "@/lib/db";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getClubQueue, getMembership } from "@/lib/db/queries/club";
import { ClubQueue } from "@/components/club/ClubQueue";
import { JoinClub } from "@/components/club/JoinClub";

export const metadata: Metadata = {
  title: "Mon club",
  description:
    "Les engagements du club, triés par heure de clôture — et qui reste à inscrire.",
};

export const dynamic = "force-dynamic";

/** Le club de la licence, proposé d'emblée : c'est presque toujours le bon. */
async function suggestedClub(userId: string) {
  const [row] = await sql(
    `SELECT c.id, c.name, c.department_code
       FROM users u
       JOIN riders r ON r.id = u.rider_id
       JOIN clubs c ON c.id = r.current_club_id
      WHERE u.id = $1::uuid`,
    [userId]
  );
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    departmentCode: (r.department_code as string) ?? null,
  };
}

export default async function ClubPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <Users className="mx-auto mb-4 size-8 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">Mon club</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          En FFC, personne ne s&apos;engage seul : le responsable du club détient
          le compte. Cette page lui montre qui reste à inscrire, et à quelle
          heure la porte se ferme.
        </p>
        <SignInButton mode="modal">
          <Button>Se connecter</Button>
        </SignInButton>
      </div>
    );
  }

  const user = await currentUser();
  const id = await resolveUser(
    clerkId,
    user?.primaryEmailAddress?.emailAddress ?? null
  );

  const membership = await getMembership(id);

  if (!membership) {
    const suggested = await suggestedClub(id);
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h1 className="text-3xl font-bold">Mon club</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Rejoins ton club pour que tes courses programmées arrivent chez la
            personne qui engage — au lieu d&apos;une croix dans un tableur
            qu&apos;il faut penser à ouvrir.
          </p>
        </header>
        <JoinClub suggested={suggested} />
      </div>
    );
  }

  const queue = await getClubQueue(membership.clubId);
  const officer = membership.role === "responsable";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Users className="size-5 text-primary" />
          <h1 className="text-3xl font-bold">{membership.clubName}</h1>
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs">
            {officer ? "responsable" : "coureur"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {officer ? (
            <>
              Ce que tes coureurs ont programmé, trié par heure de clôture. Ce
              qui est engagé disparaît de la file.
            </>
          ) : (
            <>
              Ce que le club a à engager. Passe une course en « programmée »
              depuis son calendrier pour qu&apos;elle arrive ici.
            </>
          )}
          {membership.memberCount > 1 && (
            <>
              {" "}
              <span className="font-mono tabular-nums">
                {membership.memberCount}
              </span>{" "}
              membres.
            </>
          )}
        </p>
      </header>

      <ClubQueue races={queue} canAct={officer} />

      <p className="mt-8 text-xs text-muted-foreground">
        La clôture est lue sur la fiche de l&apos;épreuve quand la fédération
        l&apos;y écrit. Sinon elle est <b>déduite</b> et marquée comme telle :
        la plupart des courses ferment à 20 h trois jours avant, mais pas
        toutes — Domfront ferme à 23 h l&apos;avant-veille. Une échéance déduite
        est un repère pour s&apos;organiser, jamais une garantie, et c&apos;est
        pour ça que le rappel par mail ne part que sur une échéance écrite.
      </p>
    </div>
  );
}

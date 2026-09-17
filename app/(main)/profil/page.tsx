import type { Metadata } from "next";
import { auth } from "@/lib/session";
import { SignInButton } from "@/components/auth";
import { UserRound } from "lucide-react";
import { StravaPanel } from "@/components/strava/StravaPanel";
import type { StravaPanelState } from "@/components/strava/StravaPanel";
import { currentUser } from "@/lib/session";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getConnection } from "@/lib/db/queries/strava";
import { stravaConfigured } from "@/lib/strava/client";
import { getRiderSeason } from "@/lib/db/queries/points";
import { PointsCounter } from "@/components/profil/PointsCounter";
import { EmailPrompt } from "@/components/profil/EmailPrompt";
import { StravaInvite } from "@/components/strava/StravaInvite";
import { isPlaceholderEmail } from "@/lib/strava/client";

/**
 * Whether this rider has linked Strava, resolved before the page renders.
 *
 * The panel used to ask /api/strava for exactly this after mounting, so the
 * page showed an empty frame until the answer arrived.
 */
async function loadStravaState(clerkId: string): Promise<StravaPanelState> {
  if (!stravaConfigured()) {
    return { configured: false, connection: null, authorizeUrl: null };
  }

  const user = await currentUser();
  const id = await resolveUser(
    clerkId,
    user?.primaryEmailAddress?.emailAddress ?? null
  );
  const connection = await getConnection(id);

  return {
    configured: true,
    connection,
    authorizeUrl: null,
  };
}

export const metadata: Metadata = {
  title: "Mon profil",
  description: "Connectez Strava pour relier vos sorties à vos courses.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfilPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const params = await searchParams;
  const status = typeof params.strava === "string" ? params.strava : undefined;
  const stravaState = userId ? await loadStravaState(userId) : null;
  const email = userId ? ((await currentUser())?.primaryEmailAddress?.emailAddress ?? null) : null;
  const canonical = userId ? await resolveUser(userId, email) : null;
  const season = canonical ? await getRiderSeason(canonical).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 w-full">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <UserRound className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Mon profil</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Reliez vos sorties Strava à vos courses pour comparer votre effort réel
          au classement et au plateau que vous avez affronté.
        </p>
      </header>

      {stravaState ? (
        <div className="flex flex-col gap-6">
          {isPlaceholderEmail(email) && <EmailPrompt />}
          <StravaPanel initialState={stravaState} initialStatus={status} />
          <PointsCounter season={season} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <StravaInvite />
          <div className="text-center py-6 border rounded-xl bg-card">
            <p className="font-medium mb-1">Ou connectez-vous par e-mail</p>
            <SignInButton size="default" variant="outline">Se connecter</SignInButton>
          </div>
        </div>
      )}
    </div>
  );
}

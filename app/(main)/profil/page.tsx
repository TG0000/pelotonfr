import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StravaPanel } from "@/components/strava/StravaPanel";
import type { StravaPanelState } from "@/components/strava/StravaPanel";
import { currentUser } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/db/queries/alerts";
import { getConnection } from "@/lib/db/queries/strava";
import { authorizeUrl, stravaConfigured } from "@/lib/strava/client";
import { getSiteUrl } from "@/lib/site-url";

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
    // The Clerk id travels through OAuth as `state` and is checked on return,
    // which is what stops another site initiating the connection.
    authorizeUrl: connection
      ? null
      : authorizeUrl(`${await getSiteUrl()}/api/strava/callback`, clerkId),
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
        <StravaPanel initialState={stravaState} initialStatus={status} />
      ) : (
        <div className="text-center py-12 border rounded-xl bg-card">
          <p className="font-medium mb-1">Connectez-vous pour lier Strava</p>
          <SignInButton mode="modal">
            <Button>Se connecter</Button>
          </SignInButton>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StravaPanel } from "@/components/strava/StravaPanel";

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

      {userId ? (
        <StravaPanel initialStatus={status} />
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

import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertManager } from "@/components/alerts/AlertManager";

export const metadata: Metadata = {
  title: "Mes alertes",
  description:
    "Recevez un email dès qu’une course correspond à vos critères : catégorie, discipline, distance depuis chez vous.",
};

export default async function AlertesPage() {
  const { userId } = await auth();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 w-full">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Mes alertes</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Un email dès qu’une course correspond à vos critères — catégorie,
          discipline et distance depuis chez vous.
        </p>
      </header>

      {userId ? (
        <AlertManager />
      ) : (
        <div className="text-center py-12 border rounded-xl bg-card">
          <p className="font-medium mb-1">Connectez-vous pour créer une alerte</p>
          <p className="text-sm text-muted-foreground mb-4">
            Vos alertes sont liées à votre compte.
          </p>
          <SignInButton mode="modal">
            <Button>Se connecter</Button>
          </SignInButton>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { Bike } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <Bike className="size-16 text-muted-foreground opacity-30" />
      <h1 className="text-3xl font-bold">Page introuvable</h1>
      <p className="text-muted-foreground max-w-sm">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link href="/" className={buttonVariants()}>
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}

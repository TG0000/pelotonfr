"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Route } from "lucide-react";
import { deposerCircuit, type DepositResult } from "@/app/(main)/course/[id]/actions";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./StartList";

/**
 * « Tu connais la boucle ? Colle le segment. »
 *
 * Quand aucune source n'a livré le circuit, la page le dit et tend la main :
 * un coureur qui a couru la course l'an dernier a le segment Strava à portée
 * de doigt. Un lien, un clic, et le parcours est là pour tout le peloton.
 * Le formulaire ne sait pas qui regarde — l'action le lui dira, et proposera
 * la marche à suivre (se connecter, relier Strava) plutôt qu'un refus sec.
 */
export function DepositCircuit({ raceId }: { raceId: string }) {
  const [link, setLink] = useState("");
  const [result, setResult] = useState<DepositResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    startTransition(async () => {
      try { const out = await deposerCircuit(raceId, link.trim()); setResult(out); if (out.ok) router.refresh(); }
      catch { setResult({ok:false,message:"Le dépôt est indisponible. Réessaie dans un instant."}); }
    });
  }

  return (
    <section>
      <SectionHeading icon={Route}>Le circuit</SectionHeading>
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-4">
        {result?.ok ? (
          <p className="text-sm">
            Circuit proposé : « {result.name} »,{" "}
            <span className="font-mono tabular-nums">{result.km} km</span> et{" "}
            <span className="font-mono tabular-nums">{result.gainM} m</span> de dénivelé.
            {result.centreM > 2500 && (
              <span className="mt-1 block text-muted-foreground">
                Il est centré à {Math.round(result.centreM / 100) / 10} km de la commune :
                vérifie que c&rsquo;est bien la boucle de cette course.
              </span>
            )}
            <span className="mt-1 block text-muted-foreground">
              Ta proposition est en attente de vérification. Le circuit public reste inchangé avant validation.
            </span>
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Personne n&rsquo;a encore tracé ce circuit. Si tu le connais, colle le
              lien du segment Strava qui fait la boucle : le parcours, le
              relief et le vent pourront être publiés après vérification.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://www.strava.com/segments/…"
                aria-label="Lien du segment Strava"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !link.trim()}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
              >
                {pending ? "Lecture du segment…" : "Déposer le circuit"}
              </button>
            </div>
            {result && !result.ok && (
              <p className="text-sm text-destructive" role="alert">
                {result.message}
                {result.message.startsWith("Connecte-toi") && (
                  <> <a href="/connexion" className="underline">Se connecter</a></>
                )}
                {result.message.startsWith("Relie ton compte") && (
                  <> <a href="/profil" className="underline">Ouvrir le profil</a></>
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

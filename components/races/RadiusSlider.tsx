"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";

/**
 * Le rayon, isolé du reste des filtres.
 *
 * Le curseur commettait déjà à la relâche plutôt qu'à chaque cran — mais le
 * brouillon vivait dans le composant de filtres, et bouger le curseur d'un
 * pixel re-rendait les quatre cents lignes qui l'entourent : les cases, les
 * dates, la recherche de commune. D'où les saccades. Le brouillon habite ici,
 * donc un glissement ne redessine que la barre.
 */
export function RadiusSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (km: number) => void;
}) {
  /** `null` : personne ne glisse, l'URL fait foi. */
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Rayon</span>
        <span className="font-medium tabular-nums">{shown} km</span>
      </div>
      <Slider
        min={10}
        max={300}
        step={10}
        value={[shown]}
        onValueChange={(v) => setDrag(Array.isArray(v) ? v[0] : (v as number))}
        onValueCommitted={(v: number | readonly number[]) => {
          setDrag(null);
          onCommit(Array.isArray(v) ? v[0] : (v as number));
        }}
        className="w-full"
      />
    </div>
  );
}

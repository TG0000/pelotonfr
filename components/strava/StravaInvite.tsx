import { StravaButton } from "@/components/auth/StravaButton";
import { cn } from "@/lib/utils";

/**
 * La proposition Strava, telle qu'elle se présente à qui n'a pas encore relié
 * ses sorties.
 *
 * Elle dit ce que le coureur obtient — pas ce que le site voudrait — et ce
 * qu'elle ne fait pas : rien n'est publié sur Strava. Le même bloc sert sur
 * l'accueil, sur Ma saison et sur le profil, pour que l'invitation soit la
 * même partout où elle est faite.
 */
export function StravaInvite({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  if (process.env.NEXT_PUBLIC_STRAVA_SIGNIN !== "true") return null;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface-1",
        compact ? "p-4" : "p-6",
        className
      )}
    >
      <div className={cn("flex gap-4", compact ? "flex-col sm:flex-row sm:items-center" : "flex-col")}>
        <div className="min-w-0 flex-1">
          <h2 className={cn("font-heading font-bold", compact ? "text-base" : "text-xl")}>
            Reliez vos sorties Strava à vos courses
          </h2>
          <ul className={cn("mt-2 grid gap-1 text-muted-foreground", compact ? "text-sm" : "gap-1.5 text-[15px] sm:grid-cols-3")}>
            <li>
              <span className="font-medium text-foreground">Vos courses passées retrouvées</span>
              {!compact && " — chaque sortie du jour J reliée au classement et au plateau."}
            </li>
            <li>
              <span className="font-medium text-foreground">Vos sorties au même endroit</span>
              {!compact && " — une synchronisation privée, sur la période que vous choisissez."}
            </li>
            <li>
              <span className="font-medium text-foreground">Lecture seule</span>
              {!compact && " — aucune écriture sur Strava, et vous pouvez déconnecter à tout moment."}
            </li>
          </ul>
        </div>
        <div className="shrink-0">
          <StravaButton size={compact ? "md" : "lg"} callbackURL="/profil?strava=ok" />
        </div>
      </div>
    </div>
  );
}

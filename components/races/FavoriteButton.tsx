"use client";

import { Heart } from "lucide-react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  raceId: string;
  className?: string;
}

export function FavoriteButton({ raceId, className }: FavoriteButtonProps) {
  const { isSignedIn } = useAuth();
  const { favoriteIds, toggle } = useFavorites();
  const isFav = favoriteIds.has(raceId);

  if (!isSignedIn) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <SignInButton mode="modal">
              <button
                className={cn(
                  "inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-muted transition-colors",
                  className
                )}
                aria-label="Ajouter aux favoris"
              >
                <Heart className="size-4" />
              </button>
            </SignInButton>
          }
        />
        <TooltipContent>Connectez-vous pour ajouter aux favoris</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggle(raceId)}
            className={cn(
              "transition-colors",
              isFav
                ? "text-red-500 hover:text-red-600"
                : "text-muted-foreground hover:text-red-400",
              className
            )}
            aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
          />
        }
      >
        <Heart className={cn("size-4", isFav && "fill-current")} />
      </TooltipTrigger>
      <TooltipContent>
        {isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
      </TooltipContent>
    </Tooltip>
  );
}

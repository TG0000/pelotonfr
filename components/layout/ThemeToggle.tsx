"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The light/dark switch.
 *
 * Which theme is active is already recorded in a class on the root element,
 * set by a blocking script in the layout before anything paints. Mirroring it
 * into React state meant reading it in an effect, so the button rendered the
 * wrong icon on first paint and corrected itself a frame later. The class is
 * the state; CSS picks the icon, and the button only has to toggle it.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // A browser refusing storage still gets the toggle, just not the memory.
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Basculer le mode sombre"
          />
        }
      >
        <Moon className="size-4 dark:hidden" />
        <Sun className="hidden size-4 dark:block" />
      </TooltipTrigger>
      <TooltipContent>
        <span className="dark:hidden">Mode sombre</span>
        <span className="hidden dark:inline">Mode clair</span>
      </TooltipContent>
    </Tooltip>
  );
}

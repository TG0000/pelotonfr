"use client";

import { Suspense } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { RaceFilters, useActiveFilterCount } from "./RaceFilters";

function FilterBadge() {
  const count = useActiveFilterCount();
  if (count === 0) return null;
  return (
    <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none font-medium ml-1">
      {count}
    </span>
  );
}

export function MobileFilters() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2" />
        }
      >
        <SlidersHorizontal className="size-4" />
        Filtres
        <Suspense fallback={null}>
          <FilterBadge />
        </Suspense>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 overflow-y-auto">
        <SheetHeader className="pb-0">
          <SheetTitle>Filtres</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <Suspense fallback={null}>
            <RaceFilters />
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}

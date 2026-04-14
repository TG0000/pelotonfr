"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { ArrowUpDown } from "lucide-react";

const SORT_OPTIONS = [
  { value: "date_asc", label: "Date (croissante)" },
  { value: "date_desc", label: "Date (décroissante)" },
] as const;

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get("sortBy") ?? "date_asc";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (e.target.value === "date_asc") {
        params.delete("sortBy");
      } else {
        params.set("sortBy", e.target.value);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
      <select
        value={current}
        onChange={handleChange}
        className="text-sm bg-transparent border rounded-md px-2 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

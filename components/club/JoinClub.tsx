"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { rejoindre } from "@/app/(main)/club/actions";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  name: string;
  departmentCode: string | null;
}

/**
 * Rejoindre son club.
 *
 * Déclaré, pas déduit. La licence dit de quel club un coureur est, mais elle ne
 * dit pas qui y engage — et un coureur peut vouloir suivre son club sans avoir
 * réclamé sa licence dans l'application.
 */
export function JoinClub({ suggested }: { suggested: Suggestion | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/clubs?q=${encodeURIComponent(value)}`);
    if (res.ok) setResults(await res.json());
  }

  function join(id: string) {
    startTransition(async () => {
      const r = await rejoindre(id);
      setMessage(r.message);
    });
  }

  if (message) {
    return (
      <p className="rounded-xl border border-border bg-surface-1 px-4 py-6 text-sm">
        {message}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      {suggested && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <span className="text-sm">
            Ta licence te donne au{" "}
            <span className="font-medium">{suggested.name}</span>.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => join(suggested.id)}
            className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            Rejoindre
          </button>
        </div>
      )}

      <label
        htmlFor="club-search"
        className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground"
      >
        Chercher un autre club
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="club-search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="VC Ferté-Macé, UC Briouze…"
          className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {results.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-sm">
                {c.name}
                {c.departmentCode && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    ({c.departmentCode})
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => join(c.id)}
                className={cn(
                  "shrink-0 rounded-lg border border-border px-2 py-1 text-xs transition-colors",
                  "hover:bg-surface-2 disabled:opacity-50"
                )}
              >
                Rejoindre
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Aucun club ne correspond. Les clubs viennent des licences fédérales —
          essaie l&apos;orthographe officielle, ou le nom de la commune.
        </p>
      )}
    </div>
  );
}

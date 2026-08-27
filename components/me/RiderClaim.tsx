"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

interface RiderMatch {
  id: string;
  uciId: string;
  name: string;
  club: string | null;
  category: string | null;
  departmentCode: string | null;
  results: number;
  wins: number;
  lastRacedOn: string | null;
}

/**
 * "Which of these is you?"
 *
 * Everything personal in this product — your results, your progression, the
 * rivals you keep meeting — needs the account tied to a rider in the
 * federation's files, and nothing did that tying. Searching by name is the only
 * humane way to ask: a rider knows their name, and almost never their licence
 * number.
 *
 * Club, department and last race are shown because two riders share a name
 * often enough that the name alone cannot settle it.
 */
export function RiderClaim({ current }: { current: RiderMatch | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RiderMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No state is cleared here: too short a query simply has nothing to search
    // for, and `visible` below decides what is shown. Clearing from inside the
    // effect would cost a render pass on every keystroke.
    if (query.trim().length < 3) return;

    let live = true;
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/me/rider?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { riders: RiderMatch[] };
        if (live) setResults(data.riders ?? []);
      } catch {
        if (live) setError("La recherche a échoué. Réessayez.");
      } finally {
        if (live) setSearching(false);
      }
    }, 350);

    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);

  /** Shown only while the query is long enough to have produced them. */
  const visible = query.trim().length >= 3 ? results : [];

  async function claim(riderId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/rider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId }),
      });
      if (!res.ok) throw new Error();
      setQuery("");
      setResults([]);
      router.refresh();
    } catch {
      setError("Le rattachement a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await fetch("/api/me/rider", { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (current) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-fsgt" />
              <span className="font-semibold">{current.name}</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {current.club ?? "sans club au fichier"}
              {current.category && ` · ${categoryLabel(current.category)}`}
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              UCI {current.uciId} · {current.results} résultats · {current.wins} victoires
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={release}
            disabled={busy}
            className="shrink-0 gap-1.5"
          >
            <X className="size-3.5" />
            Ce n&apos;est pas moi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">Retrouvez-vous au fichier</h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Vos résultats, votre progression et vos adversaires réguliers viennent
        des classements fédéraux. Dites-nous qui vous êtes pour les voir.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Votre nom, ou votre numéro UCI"
          className="pl-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {visible.length > 0 && (
        <div className="mt-3 divide-y divide-border/60 rounded-lg border border-border">
          {visible.map((r) => (
            <button
              key={r.id}
              onClick={() => claim(r.id)}
              disabled={busy}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                "hover:bg-surface-2 disabled:opacity-50"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.club ?? "sans club"}
                  {r.departmentCode && ` (${r.departmentCode})`}
                  {r.lastRacedOn && ` · dernière course ${r.lastRacedOn}`}
                </div>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {r.results} rés.
              </span>
            </button>
          ))}
        </div>
      )}

      {query.trim().length >= 3 && !searching && visible.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Aucun coureur de ce nom au fichier. Vérifiez l&apos;orthographe, ou
          cherchez par numéro UCI.
        </p>
      )}
    </div>
  );
}

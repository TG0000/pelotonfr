"use client";

import { useCallback, useState } from "react";
import { Activity, RefreshCw, Unlink, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

interface Connection {
  athleteName: string | null;
  ftpWatts: number | null;
  weightKg: number | null;
  lastSyncedAt: string | null;
}

interface State {
  configured: boolean;
  connection: Connection | null;
  authorizeUrl: string | null;
}

export type StravaPanelState = State;

/**
 * The banner Strava's callback asked us to show.
 *
 * `initialStatus` comes from the redirect's query string, so it is fixed for
 * the life of the mount — reading it once at initialisation says that, where
 * an effect syncing it into state suggested it could change and cost a second
 * render pass on every visit.
 */
function statusMessage(status?: string): string | null {
  switch (status) {
    case undefined:
    case "":
      return null;
    case "ok":
      return "Compte Strava connecté.";
    case "refus":
      return "Connexion refusée sur Strava.";
    case "session":
      return "La session ne correspond pas — reconnectez-vous puis réessayez.";
    default:
      return "La connexion a échoué.";
  }
}

/**
 * The connection state is handed in already resolved.
 *
 * Fetching it from the browser on mount meant the panel rendered nothing at
 * all until the round-trip came back — on a page whose whole content is this
 * panel. It refetches only after it has changed something itself.
 */
export function StravaPanel({
  initialState,
  initialStatus,
}: {
  initialState: State;
  initialStatus?: string;
}) {
  const [state, setState] = useState<State>(initialState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(() =>
    statusMessage(initialStatus)
  );

  /** Re-reads the connection after this panel has changed it. */
  const load = useCallback(async () => {
    const res = await fetch("/api/strava");
    if (res.ok) setState((await res.json()) as State);
  }, []);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = (await res.json()) as {
        synced?: number;
        linked?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Échec");
      setMessage(
        `${data.synced} sorties synchronisées, ${data.linked} reliées à une course.`
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Échec de la synchronisation");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    await fetch("/api/strava", { method: "DELETE" });
    setMessage(null);
    await load();
    setBusy(false);
  }

  if (!state.configured) {
    return (
      <div className="border rounded-xl p-4 bg-card">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <Activity className="size-4 text-primary" />
          Strava
        </h2>
        <p className="text-sm text-muted-foreground">
          La connexion Strava n’est pas encore configurée sur ce déploiement.
        </p>
      </div>
    );
  }

  const c = state.connection;
  const wattsPerKg =
    c?.ftpWatts && c.weightKg ? (c.ftpWatts / c.weightKg).toFixed(2) : null;

  return (
    <div className="border rounded-xl p-4 bg-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Strava
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {c
              ? c.athleteName ?? "Compte connecté"
              : "Reliez vos sorties à vos courses et à votre niveau réel."}
          </p>
        </div>
        {c && (
          <Button variant="ghost" size="icon-sm" onClick={unlink} disabled={busy} title="Déconnecter">
            <Unlink className="size-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {c && (c.ftpWatts || c.weightKg) && (
        <div className="flex items-center gap-4 text-sm">
          {c.ftpWatts && (
            <span className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-muted-foreground" />
              <span className="font-semibold tabular-nums">{c.ftpWatts} W</span>
              <span className="text-muted-foreground text-xs">FTP</span>
            </span>
          )}
          {wattsPerKg && (
            <span className="tabular-nums">
              <span className="font-semibold">{wattsPerKg}</span>
              <span className="text-muted-foreground text-xs"> W/kg</span>
            </span>
          )}
        </div>
      )}

      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <div className="flex gap-2">
        {c ? (
          <Button variant="outline" size="sm" onClick={sync} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Synchroniser
          </Button>
        ) : (
          state.authorizeUrl && (
            <a
              href={state.authorizeUrl}
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              <Activity className="size-4" />
              Connecter Strava
            </a>
          )
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Unlink, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StravaButton } from "@/components/auth/StravaButton";

interface SyncJob { id: string; status: string; synced: number; linked: number; retry_at: string | null; error_code: string | null }

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
  const [job, setJob] = useState<SyncJob | null>(null);
  const [days, setDays] = useState(90);
  const syncing = Boolean(job && ["queued", "running", "waiting"].includes(job.status));
  const [message, setMessage] = useState<string | null>(() =>
    statusMessage(initialStatus)
  );

  /** Re-reads the connection after this panel has changed it. */
  const load = useCallback(async () => {
    const res = await fetch("/api/strava");
    if (res.ok) setState((await res.json()) as State);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/strava/sync", { signal: controller.signal }).then(async response => {
      if (response.ok) setJob((await response.json()).job);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!job || !["queued", "running", "waiting"].includes(job.status)) return;
    const controller = new AbortController();
    const waiting = job.retry_at ? Math.max(1000, new Date(job.retry_at).getTime() - Date.now()) : 1000;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/strava/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }), signal: controller.signal });
        if (!response.ok) throw new Error("La synchronisation est interrompue. Recharge la page pour reprendre.");
        const next = (await response.json()).job as SyncJob;
        setJob(next);
        if (next.status === "completed") await load();
      } catch {
        if (!controller.signal.aborted) setMessage("La connexion a été interrompue. Recharge la page : les sorties déjà enregistrées sont conservées.");
      }
    }, Math.min(waiting, 60_000));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job, load]);

  async function sync() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/strava/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setJob(result.job);
    } catch { setMessage("La synchronisation n’a pas pu démarrer. Réessaie dans un instant."); }
    finally { setBusy(false); }
  }

  async function unlink() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/strava", { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "La déconnexion a échoué. Réessaie dans un instant.");
      await load();
      setJob(null);
      setMessage("Compte Strava déconnecté ; données importées supprimées.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La déconnexion a échoué.");
    } finally { setBusy(false); }
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
          <Button variant="ghost" size="icon-sm" onClick={unlink} disabled={busy} title="Déconnecter" aria-label="Déconnecter Strava">
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

      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}

      {job && <p role="status" className="text-sm">
        {job.status === "completed" ? `Synchronisation terminée : ${job.synced} sorties lues, ${job.linked} rapprochements avec une course.` : job.status === "waiting" ? "La synchronisation reprendra après le délai de réessai. Les sorties déjà lues sont conservées." : job.status === "failed" ? "Synchronisation incomplète. Relance-la ou choisis une période plus courte." : job.status === "cancelled" ? "Synchronisation annulée." : `Synchronisation en cours : ${job.synced} sorties lues. Tu peux fermer cette page et reprendre plus tard.`}
      </p>}
      {c && <label className="text-sm">Période à importer<select value={days} onChange={event=>setDays(Number(event.target.value))} disabled={busy || syncing} className="ml-2 rounded-md border p-2"><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={365}>Un an</option></select></label>}
      <div className="flex gap-2">
        {c ? (
          <Button variant="outline" size="sm" onClick={sync} disabled={busy || syncing} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Synchroniser
          </Button>
        ) : (
          <StravaButton callbackURL="/profil?strava=ok" />
        )}
      </div>
    </div>
  );
}

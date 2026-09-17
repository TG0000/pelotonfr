"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ExternalLink, Pause, Play, SkipForward } from "lucide-react";
import { bearingAtIndex, streetViewLink, type CoverageSpan } from "@/lib/streetview";
import { cn } from "@/lib/utils";
import { loadMaps } from "@/lib/google-maps-loader";

/**
 * Le panorama qui suit le curseur.
 *
 * Rien n'est chargé tant que le lecteur n'a pas cliqué et obtenu une
 * réservation dans le budget configuré côté serveur. Une
 * fois ouvert, le panorama se place au point choisi sur le profil ou la
 * carte, tourné dans le sens de la course, et la « visite » avance seule
 * tous les cent cinquante mètres.
 */

type State = "idle" | "loading" | "ready" | "refused";


export function StreetViewPane({
  points,
  index,
  onIndex,
  coverage = [],
  className,
}: {
  /** Un tour de la boucle : [lng, lat, alt, distance]. */
  points: Array<[number, number, number, number]>;
  /** Le point à montrer ; null : le départ. */
  index: number | null;
  /** La visite avance : le parent déplace le curseur de la carte et du profil. */
  onIndex?: (i: number) => void;
  coverage?: CoverageSpan[];
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pano = useRef<google.maps.StreetViewPanorama | null>(null);
  const service = useRef<google.maps.StreetViewService | null>(null);
  const reservation = useRef<string | null>(null);
  useEffect(() => () => {
    if (pano.current) { google.maps.event.clearInstanceListeners(pano.current); pano.current.setVisible(false); pano.current = null; }
    service.current = null;
  }, []);
  const [state, setState] = useState<State>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [noPano, setNoPano] = useState(false);
  const shown = index ?? 0;
  const at = points[Math.min(points.length - 1, Math.max(0, shown))] ?? points[0];
  const indexRef = useRef<number | null>(index);
  const onIndexRef = useRef(onIndex);
  useEffect(() => {
    indexRef.current = index;
    onIndexRef.current = onIndex;
  }, [index, onIndex]);

  const open = useCallback(async () => {
    setState("loading");
    try {
      const res = reservation.current ? null : await fetch("/api/streetview/session", { method: "POST" });
      const data = (res ? await res.json() : { ok: true, key: reservation.current }) as { ok: boolean; key?: string; reason?: string };
      if (!data.ok || !data.key) {
        setReason(data.reason ?? "Street View indisponible.");
        setState("refused");
        return;
      }
      reservation.current = data.key;
      const maps = await loadMaps(data.key);
      const { StreetViewPanorama, StreetViewService } = (await maps.importLibrary("streetView")) as google.maps.StreetViewLibrary;
      if (!host.current) return;
      service.current = new StreetViewService();
      pano.current = new StreetViewPanorama(host.current, {
        addressControl: false,
        fullscreenControl: true,
        linksControl: true,
        panControl: false,
        zoomControl: false,
        showRoadLabels: false,
        motionTracking: false,
        motionTrackingControl: false,
        enableCloseButton: false,
        clickToGo: true,
        visible: true,
      });
      /* Quand le lecteur avance dans le panorama lui-même (flèches, clic sur
         la route), la carte et le profil suivent : le point du tracé le plus
         proche devient le point choisi. Seulement s'il a vraiment bougé, pour
         ne pas boucler avec le déplacement qu'on commande nous-mêmes. */
      pano.current.addListener("position_changed", () => {
        const pos = pano.current?.getPosition();
        if (!pos) return;
        const lat = pos.lat(), lng = pos.lng();
        let best = -1, bestD = 60;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const d = Math.hypot((p[1] - lat) * 111_000, (p[0] - lng) * 111_000 * Math.cos((lat * Math.PI) / 180));
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best < 0) return;
        const cur = points[Math.min(points.length - 1, Math.max(0, indexRef.current ?? 0))];
        const moved = Math.hypot((cur[1] - lat) * 111_000, (cur[0] - lng) * 111_000 * Math.cos((lat * Math.PI) / 180));
        if (moved > 25) onIndexRef.current?.(best);
      });
      if (new URLSearchParams(window.location.search).has("capture")) {
        (window as unknown as { __pano?: google.maps.StreetViewPanorama }).__pano = pano.current;
      }
      setState("ready");
    } catch (err) {
      setReason(err instanceof Error ? err.message : "Street View n'a pas chargé.");
      setState("refused");
    }
  }, [points]);

  /* Suivre le point : le panorama le plus proche à moins de quarante mètres,
     tourné dans le sens de la course. */
  useEffect(() => {
    if (state !== "ready" || !pano.current || !service.current || !at) return;
    const heading = bearingAtIndex(points, shown);
    let cancelled = false;
    const t = setTimeout(() => {
      service.current!
        .getPanorama({ location: { lat: at[1], lng: at[0] }, radius: 40, source: google.maps.StreetViewSource.OUTDOOR })
        .then(({ data }) => {
          if (cancelled || !data.location?.pano) return;
          setNoPano(false);
          pano.current!.setPano(data.location.pano);
          pano.current!.setPov({ heading, pitch: 0 });
        })
        .catch(() => { if (!cancelled) setNoPano(true); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [state, shown, points, at]);

  /* La visite : un pas de cent cinquante mètres toutes les deux secondes et
     demie, et le parent suit. */
  useEffect(() => {
    if (!playing || state !== "ready") return;
    const id = setInterval(() => {
      let i = shown;
      const target = points[shown][3] + 150;
      while (i < points.length - 1 && points[i][3] < target) i++;
      if (i >= points.length - 1) { setPlaying(false); return; }
      onIndex?.(i);
    }, 2500);
    return () => clearInterval(id);
  }, [playing, state, shown, points, onIndex]);

  const heading = Math.round(bearingAtIndex(points, shown));
  const km = (at[3] / 1000).toFixed(1).replace(".", ",");
  const coveredM = coverage.reduce((s, c) => s + (c.toM - c.fromM), 0);
  const lapM = points[points.length - 1][3] || 1;

  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      <div ref={host} className={cn("h-full w-full", state !== "ready" && "hidden")} />

      {state !== "ready" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Eye className="size-6 text-muted-foreground" />
          <p className="max-w-xs text-sm">
            Street View à la place du coureur, dans le sens de la course.
            {coverage.length > 0 && (
              <span className="text-muted-foreground"> Couvert sur {Math.round((coveredM / lapM) * 100)} % du tour.</span>
            )}
          </p>
          {state === "refused" && reason && <p className="text-xs text-destructive">{reason}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={open}
              disabled={state === "loading"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Eye className="size-4" /> {state === "loading" ? "Ouverture…" : "Ouvrir Street View"}
            </button>
            <a
              href={streetViewLink(at[1], at[0], heading)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-1"
            >
              <ExternalLink className="size-3.5" /> Dans Google Maps
            </a>
          </div>
        </div>
      )}

      {state === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <div className="pointer-events-auto rounded-md bg-surface-1/90 px-2 py-1 font-mono text-xs tabular-nums shadow-sm backdrop-blur">
            km {km} · cap {heading}°{noPano ? " · pas de panorama ici" : ""}
          </div>
          <div className="pointer-events-auto flex gap-1">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-surface-1/90 px-2 py-1 text-xs shadow-sm backdrop-blur hover:bg-surface-2"
              title={playing ? "Mettre la visite en pause" : "Faire le tour en Street View"}
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {playing ? "Pause" : "Visite"}
            </button>
            <button
              type="button"
              onClick={() => {
                let i = shown;
                const target = points[shown][3] + 300;
                while (i < points.length - 1 && points[i][3] < target) i++;
                onIndex?.(i);
              }}
              className="inline-flex items-center rounded-md bg-surface-1/90 px-2 py-1 text-xs shadow-sm backdrop-blur hover:bg-surface-2"
              title="300 m plus loin"
            >
              <SkipForward className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

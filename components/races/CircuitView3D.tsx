"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Mountain, Wind } from "lucide-react";
import type { Ground } from "@/lib/elevation";
import { bearings, projectionFor, toLocal } from "@/lib/circuit-mesh";
import { cn } from "@/lib/utils";

/**
 * The circuit, in the land it is raced in.
 *
 * A map tells a rider where the race is. It does not tell them what the race
 * *is* — and for a village circuit that lives entirely in the relief: the drag
 * out of the valley that comes round eleven times, the exposed plateau where a
 * crosswind cuts the bunch into echelons. That is the reading a directeur
 * sportif does on a recce.
 *
 * Built on three.js. An earlier version was written against WebGL directly to
 * save the bytes, and it worked in the sense that it drew the right geometry —
 * but a hillside needs smooth normals, a road needs to sit on the ground
 * without z-fighting, and a camera needs damping before any of it reads as a
 * place rather than a diagram. Those are solved problems and solving them
 * badly cost more than the library does.
 *
 * The wind is a layer over the land, not a repaint of the road. The road
 * already carries the gradient, which is its own information and the one a
 * rider looks for first; overwriting it to say something about the wind traded
 * one reading for another. Streaks blowing across the terrain say direction
 * and strength at a glance, the way a windsock does, and leave the road alone.
 */

/** Climbs by severity; everything downhill is one quiet colour. */
function gradientColour(pct: number): THREE.Color {
  if (pct < -1) return new THREE.Color(0.62, 0.66, 0.74);
  if (pct < 3) return new THREE.Color(0.36, 0.72, 0.52);
  if (pct < 6) return new THREE.Color(0.90, 0.72, 0.30);
  if (pct < 9) return new THREE.Color(0.88, 0.52, 0.24);
  return new THREE.Color(0.85, 0.32, 0.28);
}

/**
 * How exposed each point of the lap is, from −1 (dead astern) to +1 (dead
 * ahead). The forecast names where the wind comes *from*; a rider cares which
 * way it pushes.
 */
function exposure(bearingDeg: number, windFromDeg: number): number {
  const towards = ((windFromDeg + 180) * Math.PI) / 180;
  const travel = (bearingDeg * Math.PI) / 180;
  return -Math.cos(towards - travel);
}

const M_PER_LAT = 110_574;

export function CircuitView3D({
  points,
  ground,
  windFromDeg,
  windKmh,
  className,
}: {
  points: Array<[number, number, number, number]>;
  ground: Ground;
  windFromDeg: number | null;
  windKmh: number | null;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [showWind, setShowWind] = useState(false);
  /* Asked once, at first render rather than inside the effect: React 19
     forbids a synchronous setState there, and whether this browser has WebGL
     is not something that changes while the page is open. */
  const [supported] = useState(() => {
    if (typeof document === "undefined") return true;
    try {
      const probe = document.createElement("canvas");
      return Boolean(
        probe.getContext("webgl2") ?? probe.getContext("webgl")
      );
    } catch {
      return false;
    }
  });
  const windLayer = useRef<THREE.Points | null>(null);

  const projection = useMemo(
    () =>
      projectionFor(
        (ground.south + ground.north) / 2,
        (ground.west + ground.east) / 2
      ),
    [ground]
  );

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    if (!supported) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });

    const dark = document.documentElement.classList.contains("dark");
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const sky = dark ? 0x11141a : 0xeef0ea;
    scene.background = new THREE.Color(sky);
    // Only to soften the cut edge of the grid, never to darken the course.
    scene.fog = new THREE.Fog(sky, 1, 1);

    /* ---- the land -------------------------------------------------------- */
    const n = ground.size;
    const spanX = (ground.east - ground.west) * projection.mPerLng;
    const spanY = (ground.north - ground.south) * M_PER_LAT;
    const range = Math.max(1, ground.maxZ - ground.minZ);

    /* Vertical exaggeration chosen from the ground rather than fixed: sixty-six
       metres across six kilometres is one per cent, and at any honest scale a
       bocage circuit is a grey plate. Aim for the same apparent relief
       everywhere, capped so a real climb is never turned into an alp. */
    const exaggeration = Math.min(6, Math.max(1.2, (Math.max(spanX, spanY) * 0.06) / range));
    const zOf = (z: number) => (z - ground.minZ) * exaggeration;

    const land = new THREE.PlaneGeometry(spanX, spanY, n - 1, n - 1);
    const pos = land.attributes.position;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        // PlaneGeometry runs top row first; the grid runs south to north.
        pos.setZ(row * n + col, zOf(ground.z[(n - 1 - row) * n + col]));
      }
    }
    land.computeVertexNormals();

    const landMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });
    const landColours = new Float32Array(n * n * 3);
    const low = new THREE.Color(dark ? 0x33493a : 0xb6c39c);
    const high = new THREE.Color(dark ? 0x6d6551 : 0xdfd6bd);
    for (let i = 0; i < n * n; i++) {
      const t = (ground.z[i] - ground.minZ) / range;
      const c = low.clone().lerp(high, t);
      landColours[i * 3] = c.r;
      landColours[i * 3 + 1] = c.g;
      landColours[i * 3 + 2] = c.b;
    }
    // Same winding as the height loop, so a colour lands on its own vertex.
    const ordered = new Float32Array(n * n * 3);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const src = ((n - 1 - row) * n + col) * 3;
        const dst = (row * n + col) * 3;
        ordered[dst] = landColours[src];
        ordered[dst + 1] = landColours[src + 1];
        ordered[dst + 2] = landColours[src + 2];
      }
    }
    land.setAttribute("color", new THREE.BufferAttribute(ordered, 3));

    const terrain = new THREE.Mesh(land, landMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    /* ---- the road -------------------------------------------------------- */
    const path = points.map(([lng, lat, z]) => {
      const [x, y] = toLocal(projection, lng, lat);
      return new THREE.Vector3(x, y, zOf(z) + 6);
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of path) {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const circuitSpan = Math.max(maxX - minX, maxY - minY, 400);

    const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0.25);
    const tubeSegments = Math.min(1400, Math.max(240, points.length * 2));
    const radius = Math.max(9, circuitSpan / 190);
    const tube = new THREE.TubeGeometry(curve, tubeSegments, radius, 8, false);

    const tubeColours = new Float32Array(tube.attributes.position.count * 3);
    const ring = 9; // radial segments + 1
    for (let i = 0; i <= tubeSegments; i++) {
      const t = i / tubeSegments;
      const at = Math.min(points.length - 1, Math.round(t * (points.length - 1)));
      const a = points[Math.max(0, at - 3)];
      const b = points[Math.min(points.length - 1, at + 3)];
      const run = b[3] - a[3];
      const c = gradientColour(run > 1 ? ((b[2] - a[2]) / run) * 100 : 0);
      for (let j = 0; j < ring; j++) {
        const k = (i * ring + j) * 3;
        tubeColours[k] = c.r;
        tubeColours[k + 1] = c.g;
        tubeColours[k + 2] = c.b;
      }
    }
    tube.setAttribute("color", new THREE.BufferAttribute(tubeColours, 3));

    const road = new THREE.Mesh(
      tube,
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    road.castShadow = true;
    scene.add(road);

    /* ---- light ----------------------------------------------------------- */
    const sun = new THREE.DirectionalLight(0xfff2dc, dark ? 2.6 : 3.0);
    sun.position.set(-spanX * 0.6, -spanY * 0.8, range * exaggeration + spanX);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowSpan = Math.max(spanX, spanY) * 0.7;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.far = shadowSpan * 6;
    scene.add(sun);
    scene.add(
      new THREE.HemisphereLight(
        dark ? 0x4a5a72 : 0xbcd0e8,
        dark ? 0x22282c : 0x8a7f68,
        dark ? 1.6 : 1.4
      )
    );

    /* ---- the wind, as weather over the land ------------------------------ */
    let wind: THREE.Points | null = null;
    let windVelocity = new THREE.Vector2(0, 0);
    if (windFromDeg != null) {
      const towards = ((windFromDeg + 180) * Math.PI) / 180;
      // Bearings run clockwise from north; the scene has x east and y north.
      windVelocity = new THREE.Vector2(Math.sin(towards), Math.cos(towards));

      const COUNT = 700;
      const seeds = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        seeds[i * 3] = (Math.random() - 0.5) * spanX;
        seeds[i * 3 + 1] = (Math.random() - 0.5) * spanY;
        seeds[i * 3 + 2] =
          range * exaggeration * 0.4 + Math.random() * range * exaggeration * 1.4 + 40;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
      wind = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: dark ? 0x9fc7ff : 0x3f6fd8,
          size: Math.max(6, circuitSpan / 260),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      );
      wind.visible = false;
      scene.add(wind);
    }
    windLayer.current = wind;

    /* ---- camera ---------------------------------------------------------- */
    const camera = new THREE.PerspectiveCamera(
      42,
      el.clientWidth / Math.max(1, el.clientHeight),
      circuitSpan / 60,
      Math.max(spanX, spanY) * 8
    );
    camera.up.set(0, 0, 1);
    const centre = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      range * exaggeration * 0.4
    );
    camera.position.set(
      centre.x - circuitSpan * 0.55,
      centre.y - circuitSpan * 0.8,
      centre.z + circuitSpan * 0.5
    );
    scene.fog.near = Math.max(spanX, spanY) * 1.1;
    scene.fog.far = Math.max(spanX, spanY) * 3.2;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(centre);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = circuitSpan * 0.25;
    controls.maxDistance = Math.max(spanX, spanY) * 1.8;
    // Never below the horizon: from underneath, a circuit is unreadable.
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.update();

    let frame = 0;
    let last = performance.now();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (wind && wind.visible && !still) {
        const speed = Math.max(6, windKmh ?? 20) * 2.2;
        const arr = wind.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += windVelocity.x * speed * dt;
          arr[i + 1] += windVelocity.y * speed * dt;
          // Blown off the edge, it comes back on the other side.
          if (arr[i] > spanX / 2) arr[i] -= spanX;
          if (arr[i] < -spanX / 2) arr[i] += spanX;
          if (arr[i + 1] > spanY / 2) arr[i + 1] -= spanY;
          if (arr[i + 1] < -spanY / 2) arr[i + 1] += spanY;
        }
        wind.geometry.attributes.position.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const resize = () => {
      const w = el.clientWidth;
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      land.dispose();
      tube.dispose();
      wind?.geometry.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      windLayer.current = null;
    };
  }, [ground, points, projection, windFromDeg, windKmh, supported]);

  useEffect(() => {
    if (windLayer.current) windLayer.current.visible = showWind;
  }, [showWind]);

  /** Where the wind bites, said in words rather than painted on the road. */
  const windReading = useMemo(() => {
    if (windFromDeg == null) return null;
    const bear = bearings(points);
    let worstAt = 0;
    let worst = -2;
    let intoM = 0;
    for (let i = 1; i < points.length; i++) {
      const e = exposure(bear[i], windFromDeg);
      if (e > worst) {
        worst = e;
        worstAt = i;
      }
      if (e > 0.4) intoM += points[i][3] - points[i - 1][3];
    }
    const total = points[points.length - 1][3] || 1;
    return {
      intoShare: Math.round((intoM / total) * 100),
      worstKm: points[worstAt][3] / 1000,
    };
  }, [points, windFromDeg]);

  if (!supported) {
    return (
      <div className={cn("grid place-items-center bg-surface-2 p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">
          Le rendu 3D demande WebGL, que ce navigateur n&apos;expose pas. Le
          profil et les chiffres du parcours restent complets ci-dessous.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div
        ref={host}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        aria-label="Vue en relief du circuit. Faites glisser pour tourner autour, molette pour zoomer."
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <div className="pointer-events-auto flex gap-1 rounded-lg border border-border bg-surface-1/90 p-1 backdrop-blur">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 text-xs font-medium">
            <Mountain className="size-3.5" />
            Pente
          </span>
          <button
            type="button"
            disabled={windFromDeg == null}
            onClick={() => setShowWind((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              showWind ? "bg-surface-3 font-medium" : "text-muted-foreground hover:text-foreground",
              windFromDeg == null && "cursor-not-allowed opacity-40"
            )}
            title={windFromDeg == null ? "Prévision indisponible à cette échéance" : undefined}
          >
            <Wind className="size-3.5" />
            Vent
          </button>
        </div>

        <div className="pointer-events-none rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs backdrop-blur">
          {showWind && windReading ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <span>
                <span className="font-mono tabular-nums text-foreground">
                  {windReading.intoShare} %
                </span>{" "}
                du tour face au vent
              </span>
              {windKmh != null && (
                <span className="font-mono tabular-nums">{Math.round(windKmh)} km/h</span>
              )}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Legend colour="bg-chart-5" label="descente" />
              <Legend colour="bg-fsgt" label="< 3 %" />
              <Legend colour="bg-accent" label="3–6 %" />
              <Legend colour="bg-ufolep" label="6–9 %" />
              <Legend colour="bg-destructive" label="> 9 %" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", colour)} />
      {label}
    </span>
  );
}

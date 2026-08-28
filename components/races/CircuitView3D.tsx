"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mountain, Wind } from "lucide-react";
import type { Ground } from "@/lib/elevation";
import {
  bearings,
  projectionFor,
  toLocal,
  roadMesh,
  terrainMesh,
  type RoadColouring,
} from "@/lib/circuit-mesh";
import { lookAt, multiply, perspective } from "@/lib/mat4";
import { cn } from "@/lib/utils";

/**
 * The circuit, in the land it is raced in.
 *
 * A map tells a rider where the race is. It does not tell them what the race
 * is — and for a village circuit, what it is lives entirely in the relief: the
 * drag out of the valley that comes round eleven times, the exposed plateau
 * where a crosswind cuts the peloton into echelons. That is the reading a
 * directeur sportif does on a course recce, and it is the reason this is drawn
 * in three dimensions rather than flat.
 *
 * Written against WebGL directly. A 3D library costs about six hundred
 * kilobytes and this needs a perspective matrix, an orbit and two shaders.
 *
 * Two colourings, because a circuit has two difficulties. Gradient is the one
 * every profile shows. Wind is the one nobody shows and every rider talks
 * about: which parts of the lap are into it on the day.
 */

const VERT = `#version 300 es
in vec3 position;
in vec3 normal;
in vec3 colour;
uniform mat4 viewProjection;
out vec3 vNormal;
out vec3 vColour;
out float vHeight;
void main() {
  vNormal = normal;
  vColour = colour;
  vHeight = position.z;
  gl_Position = viewProjection * vec4(position, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColour;
in float vHeight;
uniform vec3 lightDir;
uniform float minZ;
uniform float spanZ;
uniform int mode;      // 0 = land, 1 = road
uniform vec3 lowLand;
uniform vec3 highLand;
out vec4 fragColour;
void main() {
  if (mode == 1) {
    // The road carries its own colour and only a hint of shading, so a
    // headwind stretch reads the same whichever way the hill faces.
    float lambert = 0.75 + 0.25 * max(dot(normalize(vNormal), lightDir), 0.0);
    fragColour = vec4(vColour * lambert, 1.0);
    return;
  }
  float t = clamp((vHeight - minZ) / max(spanZ, 1.0), 0.0, 1.0);
  vec3 base = mix(lowLand, highLand, t);
  float lambert = 0.45 + 0.55 * max(dot(normalize(vNormal), lightDir), 0.0);
  fragColour = vec4(base * lambert, 1.0);
}`;

/** Gradient bands, matching the profile so the two read as one course. */
function gradientColour(pct: number): [number, number, number] {
  const g = Math.abs(pct);
  if (g < 3) return [0.36, 0.72, 0.52];
  if (g < 6) return [0.85, 0.68, 0.28];
  if (g < 9) return [0.86, 0.51, 0.24];
  return [0.83, 0.35, 0.30];
}

/**
 * How the wind meets the rider.
 *
 * The forecast names the direction the wind comes *from*; a rider cares which
 * way it pushes. Dead astern is a tailwind, dead ahead a headwind, and the
 * crosswind between them is the one that breaks a peloton into echelons —
 * which is why it gets a colour of its own rather than a midpoint blend.
 */
function windColour(bearingDeg: number, windFromDeg: number): [number, number, number] {
  const towards = (windFromDeg + 180) * (Math.PI / 180);
  const travel = bearingDeg * (Math.PI / 180);
  const alignment = Math.cos(towards - travel);
  if (alignment > 0.4) return [0.36, 0.72, 0.52];
  if (alignment < -0.4) return [0.83, 0.35, 0.30];
  return [0.85, 0.68, 0.28];
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<RoadColouring>("pente");
  const [failed, setFailed] = useState(false);

  /** Azimuth, tilt and distance — the whole of the camera's state. */
  const camera = useRef({ azimuth: -0.6, tilt: 0.85, distance: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const redraw = useRef<() => void>(() => {});

  const projection = useMemo(
    () =>
      projectionFor(
        (ground.south + ground.north) / 2,
        (ground.west + ground.east) / 2
      ),
    [ground]
  );

  /**
   * Vertical exaggeration, chosen from the ground rather than fixed.
   *
   * A fixed multiplier flatters a mountain and erases a bocage: sixty-six
   * metres of relief across six kilometres is one per cent, and at any honest
   * scale Louvigné is a grey plate. What a rider needs to see is the *shape* —
   * which side of the lap climbs — so the exaggeration aims for the same
   * apparent relief everywhere, about a fifteenth of the width, and is capped
   * so a real climb is never turned into an alp.
   */
  const exaggeration = useMemo(() => {
    const spanM = Math.max(
      (ground.east - ground.west) * projection.mPerLng,
      (ground.north - ground.south) * 110_574
    );
    const range = Math.max(1, ground.maxZ - ground.minZ);
    return Math.min(7, Math.max(1.2, (spanM * 0.065) / range));
  }, [ground, projection]);

  const roadColours = useMemo(() => {
    const out = new Float32Array(points.length * 3);
    const bear = bearings(points);
    for (let i = 0; i < points.length; i++) {
      let c: [number, number, number];
      if (mode === "vent" && windFromDeg != null) {
        c = windColour(bear[i], windFromDeg);
      } else {
        const a = points[Math.max(0, i - 3)];
        const b = points[Math.min(points.length - 1, i + 3)];
        const run = b[3] - a[3];
        c = gradientColour(run > 1 ? ((b[2] - a[2]) / run) * 100 : 0);
      }
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }
    return out;
  }, [points, mode, windFromDeg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
      setFailed(true);
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const land = terrainMesh(ground, projection, exaggeration);
    const road = roadMesh(points, projection, exaggeration, roadColours);

    const buffer = (
      data: Float32Array | Uint32Array,
      target: number = gl.ARRAY_BUFFER
    ) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data as unknown as BufferSource, gl.STATIC_DRAW);
      return b;
    };

    const landPos = buffer(land.positions);
    const landNorm = buffer(land.normals);
    const landIdx = buffer(land.indices, gl.ELEMENT_ARRAY_BUFFER);
    const roadPos = buffer(road.positions);
    const roadCol = buffer(road.colours);
    const roadIdx = buffer(road.indices, gl.ELEMENT_ARRAY_BUFFER);

    const aPos = gl.getAttribLocation(program, "position");
    const aNorm = gl.getAttribLocation(program, "normal");
    const aCol = gl.getAttribLocation(program, "colour");
    const uVP = gl.getUniformLocation(program, "viewProjection");
    const uLight = gl.getUniformLocation(program, "lightDir");
    const uMinZ = gl.getUniformLocation(program, "minZ");
    const uSpanZ = gl.getUniformLocation(program, "spanZ");
    const uMode = gl.getUniformLocation(program, "mode");
    const uLow = gl.getUniformLocation(program, "lowLand");
    const uHigh = gl.getUniformLocation(program, "highLand");

    const dark = document.documentElement.classList.contains("dark");
    const sky: [number, number, number] = dark
      ? [0.066, 0.075, 0.094]
      : [0.929, 0.937, 0.914];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.enable(gl.DEPTH_TEST);

    const spanM = Math.max(
      (ground.east - ground.west) * projection.mPerLng,
      (ground.north - ground.south) * 110_574
    );
    /* Framed on the circuit, not on the ground grid.
       The grid carries a margin so a valley has both its sides in frame, and
       framing on it left the lap as a stamp in the middle of a plate. */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of points) {
      const [x, y] = toLocal(projection, pt[0], pt[1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const circuitSpan = Math.max(maxX - minX, maxY - minY, 400);
    camera.current.distance ||= circuitSpan * 1.5;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const { azimuth, tilt, distance } = camera.current;
      const centreZ = ((ground.minZ + ground.maxZ) / 2) * exaggeration;
      const eye = [
        Math.sin(azimuth) * Math.cos(tilt) * distance,
        -Math.cos(azimuth) * Math.cos(tilt) * distance,
        centreZ + Math.sin(tilt) * distance,
      ];
      const vp = multiply(
        perspective(
          (42 * Math.PI) / 180,
          canvas.width / canvas.height,
          spanM / 100,
          spanM * 6
        ),
        lookAt(eye, [0, 0, centreZ], [0, 0, 1])
      );

      gl.uniformMatrix4fv(uVP, false, vp);
      gl.uniform3f(uLight, -0.4, -0.5, 0.77);
      gl.uniform1f(uMinZ, ground.minZ * exaggeration);
      gl.uniform1f(uSpanZ, (ground.maxZ - ground.minZ) * exaggeration);
      /* Low ground green, high ground bare — the way a hillside reads from a
         car window, and enough separation that a valley is a valley rather
         than a shade of the same grey. */
      if (dark) {
        gl.uniform3f(uLow, 0.13, 0.20, 0.17);
        gl.uniform3f(uHigh, 0.34, 0.33, 0.28);
      } else {
        gl.uniform3f(uLow, 0.72, 0.79, 0.66);
        gl.uniform3f(uHigh, 0.87, 0.83, 0.72);
      }

      // The land.
      gl.uniform1i(uMode, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, landPos);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, landNorm);
      gl.enableVertexAttribArray(aNorm);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(aCol);
      gl.vertexAttrib3f(aCol, 0, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, landIdx);
      gl.drawElements(gl.TRIANGLES, land.indices.length, gl.UNSIGNED_INT, 0);

      // The road.
      gl.uniform1i(uMode, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, roadPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, roadCol);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(aNorm);
      gl.vertexAttrib3f(aNorm, 0, 0, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, roadIdx);
      gl.drawElements(gl.TRIANGLES, road.indices.length, gl.UNSIGNED_INT, 0);
    };

    redraw.current = draw;
    draw();

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      gl.deleteProgram(program);
      for (const b of [landPos, landNorm, landIdx, roadPos, roadCol, roadIdx]) {
        gl.deleteBuffer(b);
      }
    };
  }, [ground, points, projection, roadColours, exaggeration]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    camera.current.azimuth += dx * 0.006;
    // Never below the horizon and never straight down: both views lose the
    // relief the whole thing exists to show.
    camera.current.tilt = Math.min(1.45, Math.max(0.18, camera.current.tilt + dy * 0.005));
    redraw.current();
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const c = camera.current;
    const next = c.distance * (1 + Math.sign(e.deltaY) * 0.12);
    c.distance = Math.min(c.distance * 4, Math.max(c.distance / 4, next));
    redraw.current();
  }, []);

  if (failed) {
    return (
      <div className={cn("grid place-items-center bg-surface-2 p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">
          Le rendu 3D demande WebGL, que ce navigateur n&apos;expose pas.
          Le profil et les chiffres du parcours restent complets ci-dessous.
        </p>
      </div>
    );
  }

  const windReady = windFromDeg != null;

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        aria-label="Vue en relief du circuit. Faites glisser pour tourner autour, molette pour zoomer."
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <div className="pointer-events-auto flex gap-1 rounded-lg border border-border bg-surface-1/90 p-1 backdrop-blur">
          <button
            type="button"
            onClick={() => setMode("pente")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              mode === "pente" ? "bg-surface-3 font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mountain className="size-3.5" />
            Pente
          </button>
          <button
            type="button"
            disabled={!windReady}
            onClick={() => setMode("vent")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              mode === "vent" ? "bg-surface-3 font-medium" : "text-muted-foreground hover:text-foreground",
              !windReady && "cursor-not-allowed opacity-40"
            )}
            title={windReady ? undefined : "Prévision indisponible à cette échéance"}
          >
            <Wind className="size-3.5" />
            Vent
          </button>
        </div>

        <div className="pointer-events-none rounded-lg border border-border bg-surface-1/90 px-2.5 py-1.5 text-xs backdrop-blur">
          {mode === "vent" && windReady ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Legend colour="bg-destructive" label="de face" />
              <Legend colour="bg-accent" label="de travers" />
              <Legend colour="bg-fsgt" label="dans le dos" />
              {windKmh != null && (
                <span className="font-mono tabular-nums text-muted-foreground">
                  {Math.round(windKmh)} km/h
                </span>
              )}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
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

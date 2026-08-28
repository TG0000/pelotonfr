import type { Ground } from "@/lib/elevation";

/**
 * A circuit turned into something a graphics card can draw.
 *
 * Everything is built once, in metres, on a local plane centred on the circuit:
 * a degree of longitude is not a degree of latitude, and doing that conversion
 * per frame would be arithmetic the card repeats sixty times a second for an
 * answer that never changes.
 */

/** Metres per degree of latitude, near enough anywhere in France. */
const M_PER_LAT = 110_574;

export interface Projection {
  lat0: number;
  lng0: number;
  mPerLng: number;
}

export function projectionFor(lat0: number, lng0: number): Projection {
  return { lat0, lng0, mPerLng: 111_320 * Math.cos((lat0 * Math.PI) / 180) };
}

export function toLocal(p: Projection, lng: number, lat: number): [number, number] {
  return [(lng - p.lng0) * p.mPerLng, (lat - p.lat0) * M_PER_LAT];
}

/**
 * The land, as a triangle grid with normals.
 *
 * Normals are computed from neighbouring heights rather than per triangle: a
 * hillside lit per face reads as a heap of facets, which is exactly the look
 * that makes a rendering feel like a diagram instead of a place.
 */
export function terrainMesh(
  ground: Ground,
  p: Projection,
  exaggeration: number
): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const n = ground.size;
  const positions = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);

  const dLng = (ground.east - ground.west) / (n - 1);
  const dLat = (ground.north - ground.south) / (n - 1);
  const stepX = dLng * p.mPerLng;
  const stepY = dLat * M_PER_LAT;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * n + col;
      const [x, y] = toLocal(
        p,
        ground.west + col * dLng,
        ground.south + row * dLat
      );
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = ground.z[i] * exaggeration;

      // Central differences, clamped at the edges.
      const zx =
        ground.z[row * n + Math.min(n - 1, col + 1)] -
        ground.z[row * n + Math.max(0, col - 1)];
      const zy =
        ground.z[Math.min(n - 1, row + 1) * n + col] -
        ground.z[Math.max(0, row - 1) * n + col];
      const nx = -zx * exaggeration * stepY;
      const ny = -zy * exaggeration * stepX;
      const nz = 2 * stepX * stepY;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    }
  }

  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  return { positions, normals, indices };
}

export type RoadColouring = "pente" | "vent";

/**
 * The road, as a ribbon standing slightly proud of the land.
 *
 * Two vertices per point, offset either side of the direction of travel, so
 * the road has width and reads as a road. Lifted a few metres because the
 * heights come from a different reading of the ground than the terrain grid
 * and a road buried in a hillside is worse than one floating over it.
 */
export function roadMesh(
  points: Array<[number, number, number, number]>,
  p: Projection,
  exaggeration: number,
  colours: Float32Array,
  widthM = 14
): { positions: Float32Array; colours: Float32Array; indices: Uint32Array } {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  const vertexColours = new Float32Array(n * 2 * 3);
  const half = widthM / 2;
  const LIFT_M = 4;

  for (let i = 0; i < n; i++) {
    const [lng, lat, z] = points[i];
    const [x, y] = toLocal(p, lng, lat);

    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const [px, py] = toLocal(p, prev[0], prev[1]);
    const [nx2, ny2] = toLocal(p, next[0], next[1]);
    let dx = nx2 - px;
    let dy = ny2 - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // The perpendicular, in the plane.
    const ox = -dy * half;
    const oy = dx * half;
    const zz = z * exaggeration + LIFT_M;

    positions[i * 6] = x + ox;
    positions[i * 6 + 1] = y + oy;
    positions[i * 6 + 2] = zz;
    positions[i * 6 + 3] = x - ox;
    positions[i * 6 + 4] = y - oy;
    positions[i * 6 + 5] = zz;

    for (let s = 0; s < 2; s++) {
      vertexColours[i * 6 + s * 3] = colours[i * 3];
      vertexColours[i * 6 + s * 3 + 1] = colours[i * 3 + 1];
      vertexColours[i * 6 + s * 3 + 2] = colours[i * 3 + 2];
    }
  }

  const indices = new Uint32Array((n - 1) * 6);
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    indices[k++] = a; indices[k++] = a + 2; indices[k++] = a + 1;
    indices[k++] = a + 1; indices[k++] = a + 2; indices[k++] = a + 3;
  }

  return { positions, colours: vertexColours, indices };
}

/** Bearing of travel at each point, in degrees clockwise from north. */
export function bearings(points: Array<[number, number, number, number]>): Float32Array {
  const n = points.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
    const dLat = b[1] - a[1];
    out[i] = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  }
  return out;
}

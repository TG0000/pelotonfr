/**
 * Which way the road is heading at each point of the lap.
 *
 * The only geometry the circuit view still computes itself. Everything else —
 * the relief, the imagery, the camera — is MapLibre's, which is the point:
 * the parts of a 3D scene worth writing by hand turned out to be none of them.
 */

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

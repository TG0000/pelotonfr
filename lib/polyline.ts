/**
 * Google's encoded polyline, which is how Strava hands over a shape.
 *
 * Kept here rather than pulled in as a dependency: it is twenty lines, it never
 * changes, and the alternative packages all carry more than this needs.
 */

export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/** Metres between two coordinates, close enough at the scale of a circuit. */
export function metresBetween(
  a: [number, number],
  b: [number, number]
): number {
  const dLat = (b[0] - a[0]) * 111_320;
  const dLng = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Cumulative distance along a track, in metres. */
export function distancesAlong(points: Array<[number, number]>): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + metresBetween(points[i - 1], points[i]));
  }
  return out;
}

/**
 * Puts a point every `spacingM` along a track, following the track exactly.
 *
 * Strava encodes a segment's shape with as few points as the shape needs — a
 * kilometre of straight road is two of them — which is honest about the geometry
 * and useless for a profile: the ground under that kilometre is read once and
 * the climb in the middle of it never existed. A circuit came back with a
 * hundred and fifty points for eight kilometres, so no amount of care about
 * elevation sampling could have helped.
 *
 * Interpolating adds no information about the *shape*; it adds places to ask
 * the elevation model about, which is where the information actually comes from.
 */
export function resample(
  points: Array<[number, number]>,
  spacingM: number
): Array<[number, number]> {
  if (points.length < 2) return points;

  const out: Array<[number, number]> = [points[0]];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const span = metresBetween(from, to);
    if (span === 0) continue;

    // Where the next point falls inside this segment, walking it out.
    let at = spacingM - carry;
    while (at < span) {
      const t = at / span;
      out.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
      at += spacingM;
    }
    carry = (carry + span) % spacingM;
  }

  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (metresBetween(tail, last) > spacingM / 4) out.push(last);
  return out;
}

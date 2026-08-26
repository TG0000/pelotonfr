/**
 * Colour conversion for consumers that cannot read the theme's own notation.
 *
 * The palette is authored in OKLCH, which is the right choice for a UI — it
 * keeps lightness perceptually even across hues — but MapLibre's style parser
 * rejects it outright, and a canvas context normalises the value rather than
 * converting it. Rather than keeping a second hard-coded palette for the map
 * (the kind of duplicate that has already bitten this codebase), the value is
 * converted here so the stylesheet stays the single source of truth.
 */

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

function toNumber(token: string, percentBase: number): number {
  return token.endsWith("%")
    ? (parseFloat(token) / 100) * percentBase
    : parseFloat(token);
}

/** sRGB gamma encoding, on a 0–1 channel. */
function encodeGamma(channel: number): number {
  const c = channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

function toHexPair(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * Converts an `oklch(...)` string to `#rrggbb`, returning null for anything
 * else. Out-of-gamut colours are clamped per channel, which is what browsers
 * do for the same input.
 */
export function oklchToHex(value: string): string | null {
  const m = OKLCH.exec(value.trim());
  if (!m) return null;

  const L = toNumber(m[1], 1);
  const C = toNumber(m[2], 0.4);
  const H = parseFloat(m[3]);
  if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H)) {
    return null;
  }

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab to LMS, cubed back out of the cube-root space OKLab works in.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  // LMS to linear sRGB.
  const r = 4.0767416621 * l - 3.3077115913 * mCone + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * mCone - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * mCone + 1.707614701 * s;

  return `#${toHexPair(encodeGamma(r))}${toHexPair(encodeGamma(g))}${toHexPair(encodeGamma(bl))}`;
}

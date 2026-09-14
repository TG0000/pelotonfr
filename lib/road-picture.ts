import sharp from "sharp";
import type { RoadPicture } from "@/lib/panoramax";

/**
 * Tourner la photo dans le sens de la course.
 *
 * Une caméra sphérique donne tout l'horizon sur une bande : illisible telle
 * quelle, et surtout sans gauche ni droite. On découpe cent degrés centrés sur
 * le sens de la course à cet endroit du tracé ; la gauche de l'image est alors
 * la gauche du coureur. Une photo plate qui regarde en arrière est gardée
 * mais ses côtés sont à inverser ; une photo de travers ne dit rien des côtés.
 */

export type Orientation = "avant" | "arrière" | "travers" | "inconnu";

/** Écart signé entre deux caps, dans ]-180, 180]. */
export function headingDelta(a: number, b: number): number {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

export async function orientPicture(
  bytes: Uint8Array,
  pic: RoadPicture
): Promise<{ bytes: Uint8Array; orientation: Orientation }> {
  if (pic.fov === 360 && pic.azimuth != null) {
    const img = sharp(Buffer.from(bytes));
    const meta = await img.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (W < 200 || H < 100) return { bytes, orientation: "inconnu" };
    // Colonne au cap voulu : le centre de l'image est au cap `azimuth`.
    const FOV = 100;
    const centre = ((headingDelta(pic.bearing, pic.azimuth) / 360) * W + W / 2 + W) % W;
    const cropW = Math.round((FOV / 360) * W);
    const top = Math.round(H * 0.28);
    const cropH = Math.round(H * 0.44);
    let left = Math.round(centre - cropW / 2);
    let out: Buffer;
    if (left >= 0 && left + cropW <= W) {
      out = await img.extract({ left, top, width: cropW, height: cropH }).resize({ width: 1024 }).jpeg({ quality: 82 }).toBuffer();
    } else {
      // La fenêtre chevauche le bord : deux morceaux recollés.
      left = ((left % W) + W) % W;
      const first = Math.min(cropW, W - left);
      const a = await sharp(Buffer.from(bytes)).extract({ left, top, width: first, height: cropH }).toBuffer();
      const b = await sharp(Buffer.from(bytes)).extract({ left: 0, top, width: cropW - first, height: cropH }).toBuffer();
      out = await sharp({ create: { width: cropW, height: cropH, channels: 3, background: "#000" } })
        .composite([{ input: a, left: 0, top: 0 }, { input: b, left: first, top: 0 }])
        .resize({ width: 1024 }).jpeg({ quality: 82 }).toBuffer();
    }
    return { bytes: new Uint8Array(out), orientation: "avant" };
  }
  if (pic.azimuth == null) return { bytes, orientation: "inconnu" };
  const d = Math.abs(headingDelta(pic.azimuth, pic.bearing));
  return { bytes, orientation: d < 60 ? "avant" : d > 120 ? "arrière" : "travers" };
}

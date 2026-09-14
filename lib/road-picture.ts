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
  // Le centre de l'image est au cap `view:azimuth` — vérifié sur des photos
  // où la route file droit devant. Le sens de déplacement ne sert qu'à
  // écarter les photos prises en tournant.
  const centreHeading = pic.azimuth;
  if (pic.fov === 360 && centreHeading != null) {
    const img = sharp(Buffer.from(bytes));
    const meta = await img.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (W < 200 || H < 100) return { bytes, orientation: "inconnu" };
    // Colonne au cap voulu : le centre de l'image est au cap `azimuth`.
    const FOV = 100;
    const centre = ((headingDelta(pic.bearing, centreHeading) / 360) * W + W / 2 + W) % W;
    const cropW = Math.round((FOV / 360) * W);
    // Regarder vers l'arrière de la voiture, c'est avoir son toit en bas de
    // l'image : la bande est remontée d'un cran dans ce cas.
    const rearward = Math.abs(headingDelta(pic.bearing, centreHeading)) > 90;
    const top = Math.round(H * (rearward ? 0.22 : 0.28));
    const cropH = Math.round(H * (rearward ? 0.38 : 0.44));
    // L'horizon boucle : l'image est doublée côte à côte, et la fenêtre ne
    // chevauche plus jamais un bord.
    const src = Buffer.from(bytes);
    const doubled = await sharp({ create: { width: W * 2, height: H, channels: 3, background: "#000" } })
      .composite([{ input: src, left: 0, top: 0 }, { input: src, left: W, top: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    let left = Math.round(centre - cropW / 2);
    if (left < 0) left += W;
    const out = await sharp(doubled)
      .extract({ left, top, width: cropW, height: cropH })
      .resize({ width: 1024 })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { bytes: new Uint8Array(out), orientation: "avant" };
  }
  if (centreHeading == null) return { bytes, orientation: "inconnu" };
  const d = Math.abs(headingDelta(centreHeading, pic.bearing));
  return { bytes, orientation: d < 60 ? "avant" : d > 120 ? "arrière" : "travers" };
}

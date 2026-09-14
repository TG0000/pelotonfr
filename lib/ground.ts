/**
 * L'état du sol, pour ceux qui ne courent pas sur le bitume.
 *
 * En cyclo-cross, en VTT, en gravel, le vent du dimanche compte moins que la
 * pluie de la semaine : c'est elle qui décide si le circuit sera sec et dur,
 * gras, ou boueux — et donc les pneus, la pression, et qui gagne. Open-Meteo
 * donne les cumuls passés et à venir sur le même appel ; on lit les sept jours
 * qui précèdent la course, quelle que soit sa distance dans le temps.
 */

const API = "https://api.open-meteo.com/v1/forecast";

export type GroundKind = "sec et dur" | "souple" | "gras" | "boueux";

export interface Ground {
  /** Pluie tombée (ou prévue) sur les trois et sept jours avant la course. */
  rain3dMm: number;
  rain7dMm: number;
  /** Pluie prévue le jour même. */
  rainDayMm: number;
  /** Minimum de la nuit précédant la course. */
  minC: number | null;
  frost: boolean;
  kind: GroundKind;
  /** Ce que ça change, en langage de coureur. */
  verdict: string;
  /** Faux quand les jours avant la course sont encore des prévisions. */
  observed: boolean;
}

function classify(rain3d: number, rain7d: number, rainDay: number): GroundKind {
  if (rain3d >= 15 || rainDay >= 8) return "boueux";
  if (rain3d >= 5 || rain7d >= 20) return "gras";
  if (rain7d >= 5) return "souple";
  return "sec et dur";
}

const VERDICT: Record<GroundKind, string> = {
  "sec et dur": "Sol sec et rapide : pression normale, ça roulera vite et les erreurs se paieront au sprint.",
  "souple": "Sol souple sans être gras : ça accroche, la pression peut baisser d'un demi-bar.",
  "gras": "Sol gras : pneus à crampons, pression basse, les relances coûtent cher.",
  "boueux": "Sol boueux : pneus boue, un vélo de rechange si tu peux, et la course se gagne à pied autant qu'à vélo.",
};

export async function getGround(
  lat: number,
  lng: number,
  raceDate: string
): Promise<Ground | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: "precipitation_sum,temperature_2m_min",
    past_days: "7",
    forecast_days: "16",
    timezone: "Europe/Paris",
  });
  try {
    const res = await fetch(`${API}?${params}`, { next: { revalidate: 3 * 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: { time: string[]; precipitation_sum: Array<number | null>; temperature_2m_min: Array<number | null> };
    };
    const d = data.daily;
    if (!d?.time?.length) return null;
    const idx = d.time.indexOf(raceDate);
    if (idx < 0) return null;

    const rain = (from: number, to: number) => {
      let sum = 0;
      for (let i = Math.max(0, from); i < Math.min(d.time.length, to); i++) sum += d.precipitation_sum[i] ?? 0;
      return Math.round(sum * 10) / 10;
    };
    const rain3dMm = rain(idx - 3, idx);
    const rain7dMm = rain(idx - 7, idx);
    const rainDayMm = rain(idx, idx + 1);
    const minC = d.temperature_2m_min[idx] ?? null;
    const kind = classify(rain3dMm, rain7dMm, rainDayMm);
    const today = new Date().toISOString().slice(0, 10);
    return {
      rain3dMm,
      rain7dMm,
      rainDayMm,
      minC,
      frost: minC != null && minC <= 0,
      kind,
      verdict: VERDICT[kind],
      observed: raceDate <= today,
    };
  } catch {
    return null;
  }
}

/** Les disciplines où c'est le sol qui commande, pas le vent. */
export function groundMatters(discipline: string): boolean {
  return discipline === "cyclocross" || discipline === "vtt" || discipline === "gravel";
}

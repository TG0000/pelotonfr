/**
 * When a race is actually run.
 *
 * No federation publishes a start time in a form we can read, so this is
 * measured where it can be and estimated where it cannot. Measured wins: an
 * activity matched to the meeting carries the exact hour the bunch rolled off
 * and how long it took.
 *
 * The estimates below come from the same measurements — seventeen senior road
 * races started between 14:00 and 15:00 and averaged just under two hours,
 * riding at 34 to 44 km/h. They are stated as estimates, and the interface
 * says which is which, because a rider planning a four-hour drive deserves to
 * know whether the time is a fact or a guess.
 */

export interface RaceTiming {
  /** Local start hour, as a decimal (14.5 = 14:30). */
  startHour: number;
  durationMinutes: number;
  /** True when this comes from a ride actually recorded on the course. */
  measured: boolean;
  source?: "published-meeting" | "historical" | "estimated";
}

const YOUTH = ["u7", "u9", "u11", "u13"];
const CADETS = ["u15", "u17"];

/** How fast the field covers ground, by discipline — for turning km into time. */
const SPEED_KMH: Record<string, number> = {
  route: 40,
  contre_la_montre: 42,
  cyclosportive: 28,
  gravel: 26,
  vtt: 22,
  cyclocross: 27,
  bmx: 30,
  piste: 45,
  pump_track: 20,
};

export function estimateTiming(
  categories: string[],
  discipline: string,
  distanceKm: number | null
): RaceTiming {
  const isYouth = categories.some((c) => YOUTH.includes(c));
  const isCadet = categories.some((c) => CADETS.includes(c));

  // Youth fields ride first so the seniors can have the closed roads after.
  const startHour = isYouth ? 14 : isCadet ? 14 : 14.5;

  let durationMinutes: number;
  if (distanceKm && distanceKm > 5) {
    const speed = SPEED_KMH[discipline] ?? 38;
    durationMinutes = Math.round((distanceKm / speed) * 60);
  } else if (isYouth) {
    durationMinutes = 45;
  } else if (isCadet) {
    durationMinutes = 75;
  } else if (discipline === "cyclocross") {
    durationMinutes = 60;
  } else {
    durationMinutes = 120;
  }

  return { startHour, durationMinutes, measured: false };
}

/** Turns a decimal hour into the shape a start sheet uses. */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function parsePublishedHour(value: string | null): number | null {
  const match = value?.trim().match(/^(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/i);
  if (!match) return null;
  const hour=Number(match[1]), minute=Number(match[2] ?? 0);
  return hour<24 && minute<60 ? hour+minute/60 : null;
}
export function resolveTiming(input: { categories:string[]; discipline:string; distanceKm:number|null; startTime:string|null; bibPickupTime:string|null; historical:{startHour:number;durationMinutes:number}|null }): RaceTiming {
  const estimated=estimateTiming(input.categories,input.discipline,input.distanceKm);
  const published=parsePublishedHour(input.startTime);
  if(published!==null)return {...estimated,startHour:published,source:"published-meeting"};
  if(input.historical)return {...input.historical,measured:true,source:"historical"};
  const bib=parsePublishedHour(input.bibPickupTime);
  return {...estimated,startHour:bib===null?estimated.startHour:Math.min(23.5,Math.max(estimated.startHour,bib+0.5)),source:"estimated"};
}

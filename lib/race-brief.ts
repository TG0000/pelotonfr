import type { RaceWeather } from "@/lib/weather";
import type { Ground } from "@/lib/ground";
import type { RoadReport } from "@/lib/road";
import type { RoadSeen } from "@/lib/road-vision";
import { cardinal } from "@/lib/weather";
import { formatHour } from "@/lib/race-timing";

/**
 * Le brief de la veille : ce que la course va faire, dit en phrases.
 *
 * Un directeur sportif ne lit pas huit panneaux la veille d'une course, il dit
 * à ses coureurs trois choses : où ça se décide, qui vient, et ce qu'il ne
 * faut pas rater. Tout ce que la page sait déjà — engagés, plateau, tracé,
 * bosses, vent, clôture — est ici recoupé et écrit dans cet ordre, du côté du
 * coureur. Rien n'est inventé : une phrase n'existe que si sa donnée existe,
 * et le brief se tait plutôt que de meubler.
 */

export interface BriefInput {
  /** Jours avant la course, 0 le jour même. */
  daysLeft: number;
  /** Heure de départ locale, décimale. Mesurée si une sortie l'a enregistrée. */
  startHour: number | null;
  timingMeasured: boolean;
  entriesEngaged: number | null;
  entriesCapacity: number | null;
  /** ISO local, « 2026-08-25T20:00 ». */
  entriesCloseAt: string | null;
  /** Coureurs sur la liste des engagés publiée. */
  entrantCount: number | null;
  clubGoing: number | null;
  trace: {
    distanceM: number;
    elevationGainM: number;
    points: Array<[number, number, number, number]>;
  } | null;
  circuitM: number | null;
  lapCount: number | null;
  distanceKm: number | null;
  climbs: Array<{ name: string; distanceM: number; averageGrade: number; onCourse: boolean }>;
  field: { editions: number; medianClassified: number; bestRank: number | null; medianRank: number | null } | null;
  lastEdition: { date: string; starters: number; winner: { name: string; club: string | null } | null } | null;
  weather: RaceWeather | null;
  /** Le sol, pour le cyclo-cross, le VTT et le gravel ; null sur route. */
  ground: Ground | null;
  /** La route sous le tracé, quand l'IGN l'a reconnue. */
  road: RoadReport | null;
  /** Le revêtement lu sur les photos Panoramax, quand il y en a. */
  seen: RoadSeen | null;
  /** Aujourd'hui, ISO local, pour la clôture. */
  now: Date;
}

export interface Brief {
  /** Une phrase chacune, dans l'ordre où un DS les dirait. */
  lines: string[];
  /** Combien de sources ont parlé — sous deux, le brief ne vaut pas sa place. */
  sources: number;
}

/** « d'ouest », « de nord-ouest » : l'élision devant la voyelle. */
function de(from: string): string {
  return /^[aeiouy]/.test(from) ? `d'${from}` : `de ${from}`;
}

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function km(m: number): string {
  return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace(".", ",")} km`;
}

/** Part du tour vent de face, vent dans le dos, et la plus longue portion de face. */
function windOnLap(
  points: Array<[number, number, number, number]>,
  windFromDeg: number
): { headShare: number; tailShare: number; longestHeadM: number; longestHeadFromM: number } | null {
  if (points.length < 3) return null;
  const towards = ((windFromDeg + 180) * Math.PI) / 180;
  let head = 0;
  let tail = 0;
  let longest = 0;
  let longestFrom = 0;
  let run = 0;
  let runFrom = 0;
  const total = points[points.length - 1][3];
  for (let i = 1; i < points.length; i++) {
    const a = points[Math.max(0, i - 2)];
    const b = points[Math.min(points.length - 1, i + 2)];
    const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
    const travel = Math.atan2(dLng, b[1] - a[1]);
    const alignment = -Math.cos(towards - travel);
    const step = points[i][3] - points[i - 1][3];
    if (alignment > 0.4) {
      head += step;
      if (run === 0) runFrom = points[i - 1][3];
      run += step;
      if (run > longest) {
        longest = run;
        longestFrom = runFrom;
      }
    } else {
      run = 0;
      if (alignment < -0.4) tail += step;
    }
  }
  if (total <= 0) return null;
  return { headShare: head / total, tailShare: tail / total, longestHeadM: longest, longestHeadFromM: longestFrom };
}

export function composeBrief(input: BriefInput): Brief {
  const lines: string[] = [];
  let sources = 0;

  // 1. Le départ, et ce qu'il reste à faire pour y être.
  if (input.entriesCloseAt) {
    const close = new Date(input.entriesCloseAt);
    if (!Number.isNaN(close.getTime())) {
      const hours = close.getHours() + close.getMinutes() / 60;
      const when = `${DAYS[close.getDay()]} à ${formatHour(hours)}`;
      if (close.getTime() > input.now.getTime()) {
        const left =
          input.entriesCapacity != null && input.entriesEngaged != null
            ? Math.max(0, input.entriesCapacity - input.entriesEngaged)
            : null;
        lines.push(
          left != null && left > 0
            ? `Les engagements ferment ${when}, il reste ${left} place${left > 1 ? "s" : ""} : c'est le club qui engage, pas toi.`
            : left === 0
              ? `Complet : ${input.entriesEngaged} engagés, plus une place avant la clôture de ${when}.`
              : `Les engagements ferment ${when} : c'est le club qui engage, pas toi.`
        );
      } else {
        lines.push(`Les engagements sont clos depuis ${when}.`);
      }
      sources++;
    }
  }

  // 2. Qui vient.
  const heads: string[] = [];
  if (input.entrantCount != null && input.entrantCount > 0) {
    heads.push(`${input.entrantCount} coureurs sur la liste des engagés`);
  } else if (input.entriesEngaged != null && input.entriesEngaged > 0) {
    heads.push(`${input.entriesEngaged} engagés au compteur fédéral`);
  }
  if (input.clubGoing != null && input.clubGoing > 0) {
    heads.push(`${input.clubGoing} du club y ${input.clubGoing > 1 ? "vont" : "va"}`);
  }
  if (heads.length > 0) {
    lines.push(heads.join(", ") + ".");
    sources++;
  }

  // 3. Le plateau, d'après les éditions passées.
  if (input.field && input.field.editions > 0) {
    const f = input.field;
    let s = `D'habitude ${f.medianClassified} classés à l'arrivée`;
    if (f.medianRank != null) s += `, niveau médian du peloton autour de la ${f.medianRank}ᵉ place nationale`;
    if (f.bestRank != null && f.bestRank < 500) s += `, avec un ${f.bestRank}ᵉ national déjà venu`;
    lines.push(s + ".");
    sources++;
  }
  if (input.lastEdition?.winner) {
    const w = input.lastEdition.winner;
    const year = input.lastEdition.date.slice(0, 4);
    lines.push(
      `En ${year}, ${w.name}${w.club ? ` (${w.club})` : ""} a gagné devant ${input.lastEdition.starters} classés.`
    );
    sources++;
  }

  // 4. Le parcours : la boucle, les tours, ce qui grimpe.
  const lapM = input.trace?.distanceM ?? input.circuitM;
  const laps =
    input.lapCount ??
    (lapM && input.distanceKm ? Math.round((input.distanceKm * 1000) / lapM) : null);
  if (lapM) {
    let s = `Une boucle de ${km(lapM)}`;
    if (laps && laps > 1) s += ` à couvrir ${laps} fois`;
    if (input.trace) {
      const perLap = input.trace.elevationGainM;
      s += `, ${perLap} m de dénivelé par tour`;
      if (laps && laps > 1) s += ` (${perLap * laps} m au total)`;
    }
    lines.push(s + ".");
    sources++;
  }
  if (input.road && input.road.verdict !== "Route de largeur ordinaire, sans surprise.") {
    lines.push(input.road.verdict);
    sources++;
  }
  if (input.seen?.verdict) {
    lines.push(input.seen.verdict);
    sources++;
  }

  const onCourse = input.climbs.filter((c) => c.onCourse);
  // Une « bosse » de 300 m à 3 % ne décide rien ; on ne la nomme pas.
  const climbs = (onCourse.length > 0 ? onCourse : input.climbs.slice(0, 2)).filter(
    (c) => c.distanceM * c.averageGrade >= 1500
  );
  if (climbs.length > 0) {
    const main = [...climbs].sort((a, b) => b.distanceM * b.averageGrade - a.distanceM * a.averageGrade)[0];
    const grade = main.averageGrade.toFixed(1).replace(".", ",");
    lines.push(
      onCourse.length > 0
        ? `Ça se décide dans ${main.name} : ${km(main.distanceM)} à ${grade} %${laps && laps > 1 ? `, ${laps} passages` : ""}.`
        : `Sans tracé confirmé, la bosse du coin est ${main.name} : ${km(main.distanceM)} à ${grade} %.`
    );
    sources++;
  }

  // 5a. Hors bitume, c'est le sol qui commande : la pluie de la semaine,
  //     pas le vent de l'après-midi.
  if (input.ground) {
    const g = input.ground;
    const rain =
      g.rain3dMm > 0
        ? `${g.rain3dMm.toString().replace(".", ",")} mm de pluie sur les trois derniers jours`
        : g.rain7dMm > 0
          ? `${g.rain7dMm.toString().replace(".", ",")} mm sur la semaine, rien depuis trois jours`
          : "pas une goutte depuis une semaine";
    lines.push(
      `${rain[0].toUpperCase()}${rain.slice(1)}${g.observed ? "" : " (prévision)"}` +
        `${g.rainDayMm >= 2 ? `, ${g.rainDayMm.toString().replace(".", ",")} mm attendus le jour même` : ""}. ${g.verdict}`
    );
    if (g.frost && g.minC != null) {
      lines.push(`${Math.round(g.minC)} °C la nuit d'avant : gel possible au départ, le sol durcit puis dégèle en surface.`);
    }
    sources++;
  }

  // 5b. Le vent et la pluie, posés sur la boucle quand on l'a. Hors bitume,
  //     seulement s'il souffle vraiment : sur un circuit en sous-bois il
  //     n'a pas voix au chapitre.
  if (input.weather && input.ground && input.weather.windVerdict !== "calme" && input.weather.windVerdict !== "sensible") {
    const w = input.weather;
    lines.push(`Vent ${de(cardinal(w.atStart.windDirectionDeg))} à ${w.atStart.windKmh} km/h, rafales à ${w.peakGustKmh} : les parties dégagées seront dures, abrite-toi dans les portions rapides.`);
    if (w.atStart.temperatureC <= 5) lines.push(`${Math.round(w.atStart.temperatureC)} °C au départ : échauffe-toi sur home-trainer, le premier tour part à bloc.`);
  } else if (input.weather && !input.ground) {
    const w = input.weather;
    const from = cardinal(w.atStart.windDirectionDeg);
    let s: string;
    const lap = input.trace ? windOnLap(input.trace.points, w.atStart.windDirectionDeg) : null;
    if (w.windVerdict === "calme") {
      s = `Vent faible (${w.atStart.windKmh} km/h ${de(from)}) : ça se jouera aux jambes, pas aux bordures.`;
    } else if (lap && lap.longestHeadM > 500) {
      s =
        `Vent ${de(from)} à ${w.atStart.windKmh} km/h, rafales à ${w.peakGustKmh} : de face sur ` +
        `${Math.round(lap.headShare * 100)} % du tour, dont ${km(lap.longestHeadM)} d'affilée ` +
        (lap.longestHeadFromM < 200
          ? "dès la ligne"
          : `à partir du km ${(lap.longestHeadFromM / 1000).toFixed(1).replace(".", ",")}`) +
        (w.windVerdict === "décisif" || w.windVerdict === "fort"
          ? ". Reste placé devant avant cette portion : c'est là que ça cassera."
          : ".");
    } else {
      s =
        `Vent ${de(from)} à ${w.atStart.windKmh} km/h, rafales à ${w.peakGustKmh}` +
        (w.windVerdict === "décisif" || w.windVerdict === "fort"
          ? " : assez pour faire des bordures sur le dégagé, ne prends pas le départ derrière."
          : ".");
    }
    lines.push(s);
    if (w.peakRainProbability >= 50) {
      lines.push(`${w.peakRainProbability} % de risque de pluie pendant la course : boyaux et freins en conséquence.`);
    }
    if (w.atStart.temperatureC <= 8) {
      lines.push(`${Math.round(w.atStart.temperatureC)} °C au départ : échauffe-toi long, l'attaque du premier tour part à froid.`);
    } else if (w.atStart.temperatureC >= 28) {
      lines.push(`${Math.round(w.atStart.temperatureC)} °C au départ : deux bidons, pas un.`);
    }
    sources++;
  }

  // 6. L'heure, en dernier : on la sait toujours à peu près.
  if (input.startHour != null) {
    lines.push(
      input.timingMeasured
        ? `Départ vers ${formatHour(input.startHour)}, relevé sur une sortie enregistrée.`
        : `Départ estimé vers ${formatHour(input.startHour)}, à confirmer sur la fiche de l'organisateur.`
    );
  }

  return { lines, sources };
}

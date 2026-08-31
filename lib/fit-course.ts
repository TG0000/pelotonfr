import { Encoder, Profile } from "@garmin/fitsdk";


/**
 * Un parcours au format FIT.
 *
 * Le GPX est un fichier de trace : une suite de points, que le compteur affiche
 * comme une ligne à suivre. Le FIT est le format natif de Garmin et de Wahoo —
 * c'est un parcours, avec sa distance, son dénivelé et ses points remarquables,
 * et c'est le seul que l'API Wahoo accepte pour créer une route.
 *
 * Les positions y sont écrites en semicircles : le degré divisé par 2^31/180.
 * Écrire des degrés donne un fichier valide qui pose la course à quelques
 * centaines de kilomètres de là.
 */

/** Le degré vers le semicircle, l'unité de position du FIT. */
const SEMICIRCLES = 2 ** 31 / 180;

function toSemicircles(degrees: number): number {
  return Math.round(degrees * SEMICIRCLES);
}

/** Distance en mètres entre deux points, sur la sphère. */
function metresBetween(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Le SDK décrit chaque message par un type distinct que TypeScript ne sait pas
   choisir depuis un numéro variable. On passe donc par un seul point, commenté,
   plutôt que par une conversion dispersée à chaque appel. */
function emit(
  encoder: Encoder,
  mesgNum: number,
  mesg: Record<string, unknown>
): void {
  (encoder.onMesg as (n: number, m: Record<string, unknown>) => void)(
    mesgNum,
    mesg
  );
}

export interface FitCourse {
  bytes: Uint8Array;
  distanceM: number;
  ascentM: number;
}

/**
 * @param points  [lng, lat, altitude] dans l'ordre du parcours.
 * @param name    Le nom que le compteur affichera. Garmin le tronque à 16
 *                caractères sur certains modèles ; on ne le tronque pas ici,
 *                l'appareil s'en charge et le nom complet sert ailleurs.
 * @param date    Le jour de la course, écrit dans l'en-tête du fichier.
 */
/** [lng, lat, altitude, …] — le tracé porte parfois une valeur de plus. */
export type TracePoint = readonly [number, number, number, ...number[]];

export function encodeCourse(
  points: readonly TracePoint[],
  name: string,
  date: Date
): FitCourse {
  const encoder = new Encoder();

  emit(encoder, Profile.MesgNum.FILE_ID, {
    type: "course",
    manufacturer: "development",
    product: 0,
    timeCreated: date,
    serialNumber: 0,
  });

  emit(encoder, Profile.MesgNum.COURSE, { name, sport: "cycling" });

  /* Le compteur veut une distance cumulée à chaque point : c'est elle qui fait
     le « il reste 12 km » et le profil qui défile. */
  let distance = 0;
  let ascent = 0;
  const records: Array<{
    timestamp: Date;
    positionLat: number;
    positionLong: number;
    altitude: number;
    distance: number;
  }> = [];

  for (let i = 0; i < points.length; i++) {
    const [lng, lat, altitude] = points[i];
    if (i > 0) {
      const [plng, plat, palt] = points[i - 1];
      distance += metresBetween([plng, plat], [lng, lat]);
      const climb = altitude - palt;
      // Le bruit d'altimètre monte de quelques centimètres à chaque point ;
      // sous un mètre, ce n'est pas du dénivelé.
      if (climb >= 1) ascent += climb;
    }
    records.push({
      /* Un parcours n'a pas d'heure : le FIT en exige une, alors chaque point
         prend une seconde. Le compteur ne s'en sert que pour l'ordre. */
      timestamp: new Date(date.getTime() + i * 1000),
      positionLat: toSemicircles(lat),
      positionLong: toSemicircles(lng),
      altitude,
      distance: Math.round(distance),
    });
  }

  const first = points[0];
  const last = points[points.length - 1];

  emit(encoder, Profile.MesgNum.LAP, {
    timestamp: new Date(date.getTime() + points.length * 1000),
    startTime: date,
    totalDistance: Math.round(distance),
    totalTimerTime: points.length,
    totalElapsedTime: points.length,
    totalAscent: Math.round(ascent),
    startPositionLat: toSemicircles(first[1]),
    startPositionLong: toSemicircles(first[0]),
    endPositionLat: toSemicircles(last[1]),
    endPositionLong: toSemicircles(last[0]),
  });

  for (const record of records) {
    emit(encoder, Profile.MesgNum.RECORD, record);
  }

  // Le départ et l'arrivée, pour que le compteur annonce la fin du parcours.
  emit(encoder, Profile.MesgNum.COURSE_POINT, {
    timestamp: date,
    positionLat: toSemicircles(first[1]),
    positionLong: toSemicircles(first[0]),
    distance: 0,
    type: "generic",
    name: "Départ",
  });
  emit(encoder, Profile.MesgNum.COURSE_POINT, {
    timestamp: new Date(date.getTime() + points.length * 1000),
    positionLat: toSemicircles(last[1]),
    positionLong: toSemicircles(last[0]),
    distance: Math.round(distance),
    type: "generic",
    name: "Arrivée",
  });

  return {
    bytes: encoder.close(),
    distanceM: Math.round(distance),
    ascentM: Math.round(ascent),
  };
}

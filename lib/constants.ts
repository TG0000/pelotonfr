export const FEDERATIONS = [
  { id: 1, slug: "ffc", name: "FFC", fullName: "Fédération Française de Cyclisme" },
  { id: 2, slug: "fsgt", name: "FSGT", fullName: "Fédération Sportive et Gymnique du Travail" },
  { id: 3, slug: "ufolep", name: "UFOLEP", fullName: "Union Française des Œuvres Laïques d'Éducation Physique" },
] as const;

export type FederationSlug = "ffc" | "fsgt" | "ufolep";

export const DISCIPLINES = [
  { value: "route", label: "Course sur route" },
  { value: "contre_la_montre", label: "Contre-la-montre" },
  { value: "course_par_etapes", label: "Course par étapes" },
  { value: "cyclosportive", label: "Cyclosportive" },
  { value: "gravel", label: "Gravel" },
  { value: "vtt", label: "VTT" },
  { value: "cyclocross", label: "Cyclocross" },
  { value: "bmx", label: "BMX" },
  { value: "pump_track", label: "Pump Track" },
  { value: "piste", label: "Piste" },
] as const;

export type Discipline =
  | "route"
  | "contre_la_montre"
  | "course_par_etapes"
  | "cyclosportive"
  | "gravel"
  | "vtt"
  | "cyclocross"
  | "bmx"
  | "pump_track"
  | "piste";

// The category vocabulary lives in lib/categories.ts, next to the parser that
// writes it. A second copy used to live here for the filter UI; the two drifted
// (this one still offered "Open2" and "Cadets" long after the scrapers moved to
// "open2" and "u17"), so most category filters silently matched nothing.

export const RACE_LEVELS = [
  { value: "international", label: "International" },
  { value: "national", label: "National" },
  { value: "regional", label: "Régional" },
  { value: "local", label: "Local / Départemental" },
] as const;

export type RaceLevel = (typeof RACE_LEVELS)[number]["value"];

export const DISTANCE_PRESETS = [25, 50, 100, 150, 200, 300] as const;
export const DEFAULT_RADIUS_KM = 50;

// Default map center: France centroid
export const FRANCE_CENTER: [number, number] = [2.35, 46.53];
export const FRANCE_ZOOM = 5.5;

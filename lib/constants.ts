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

export const CATEGORIES = [
  { value: "Elite", label: "Élite", group: "Compétition" },
  { value: "Open1", label: "Open 1", group: "Compétition" },
  { value: "Open2", label: "Open 2", group: "Compétition" },
  { value: "Open3", label: "Open 3", group: "Compétition" },
  { value: "Access1", label: "Access 1", group: "Access" },
  { value: "Access2", label: "Access 2", group: "Access" },
  { value: "Access3", label: "Access 3", group: "Access" },
  { value: "Access4", label: "Access 4", group: "Access" },
  { value: "Juniors", label: "Juniors (U19)", group: "Jeunes" },
  { value: "Cadets", label: "Cadets (U17)", group: "Jeunes" },
  { value: "Minimes", label: "Minimes (U15)", group: "Jeunes" },
  { value: "Feminines", label: "Féminines", group: "Féminin" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

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

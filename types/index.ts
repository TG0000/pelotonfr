import type { Discipline, RaceLevel, FederationSlug } from "@/lib/constants";

export interface Race {
  id: string;
  externalId: string;
  federationId: number;
  federationSlug: FederationSlug;
  name: string;
  slug: string | null;
  sourceUrl: string | null;
  raceDate: string; // ISO date string
  raceDateEnd: string | null;
  city: string;
  departmentCode: string | null;
  departmentName: string | null;
  region: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  geocodingStatus: "pending" | "success" | "failed";
  discipline: Discipline;
  raceType: string | null;
  level: RaceLevel | null;
  categories: string[];
  gender: "men" | "women" | "mixed";
  distanceKm: number | null;
  isCancelled: boolean;
  /** Quand l'annulation a été apprise, pour la dire à sa juste fraîcheur. */
  cancelledAt: string | null;
  organizer: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  /* What the organiser wrote on their own competition page. Absent for most
     races — a third of them state where dossards are collected, one in twenty
     states the circuit — which is why every one of these is nullable. */
  bibPickupTime: string | null;
  /** Le premier départ de la réunion, tel que l'organisateur l'écrit : « 13h ». */
  startTime: string | null;
  /** Déjà engagés, d'après « 74/150 places disponibles » sur la fiche fédérale. */
  entriesEngaged: number | null;
  entriesCapacity: number | null;
  /** Les engagés de la liste publiée par la presse, quand elle l'est. */
  entrantCount: number | null;
  /** Clôture des engagements, ISO ; `entriesCloseSource` dit si elle est lue ou déduite. */
  entriesCloseAt: string | null;
  entriesCloseSource: string | null;
  /** Prévue au départ, quand la course est dans la semaine. */
  forecast: { windKmh: number; gustKmh: number | null; windFromDeg: number | null; rainPct: number | null; tempC: number | null } | null;
  /** Membres du club du lecteur qui y vont — connu seulement pour un membre. */
  clubGoing: number | null;
  bibPickupPlace: string | null;
  /** One lap, in metres, as the organiser announced it. */
  circuitM: number | null;
  lapCount: number | null;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
  // Computed (may be present if queried with geo)
  distanceFromUserKm?: number;
}

export interface RaceFilters {
  fed: FederationSlug[];
  disc: Discipline[];
  cat: string[];
  dateFrom: string;
  dateTo: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  q: string;
  page: number;
  sortBy: "date_asc" | "date_desc" | "distance" | "engages" | "club";
  /** Le club du lecteur, pour compter qui y va et trier dessus. */
  clubId?: string | null;
}

export interface PaginatedRaces {
  races: Race[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GeocodingResult {
  lat: number;
  lng: number;
  label: string;
}

export interface User {
  id: string;
  clerkId: string;
  email: string | null;
  displayName: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeCity: string | null;
  defaultRadiusKm: number;
}

/**
 * Une course telle que la carte et la grille du mois la dessinent.
 *
 * La carte reçoit mille sept cents courses d'un coup : envoyées entières —
 * notes, contacts, prévision, clôture — elles pesaient 3,9 Mo de page. Un
 * point sur une carte n'a besoin que de ce qui se lit dessus.
 */
export type RaceMarker = Pick<
  Race,
  | "id" | "name" | "raceDate" | "raceDateEnd" | "lat" | "lng"
  | "federationSlug" | "categories" | "city" | "departmentCode" | "departmentName"
  | "discipline" | "raceType"
>;

export function toRaceMarker(r: Race): RaceMarker {
  return {
    id: r.id, name: r.name, raceDate: r.raceDate, raceDateEnd: r.raceDateEnd,
    lat: r.lat, lng: r.lng, federationSlug: r.federationSlug, categories: r.categories,
    city: r.city, departmentCode: r.departmentCode, departmentName: r.departmentName,
    discipline: r.discipline, raceType: r.raceType,
  };
}

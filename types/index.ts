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
  organizer: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
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
  sortBy: "date_asc" | "date_desc";
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

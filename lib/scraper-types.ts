import type { Discipline, RaceLevel } from "./constants";

export interface ScrapedRace {
  externalId: string;
  name: string;
  raceDate: Date;
  raceDateEnd?: Date;
  city: string;
  departmentCode?: string;
  departmentName?: string;
  postcode?: string;
  discipline: Discipline;
  raceType?: string;
  level?: RaceLevel;
  categories: string[];
  gender?: "men" | "women" | "mixed";
  distanceKm?: number;
  sourceUrl?: string;
  organizer?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  isCancelled: boolean;
}

export interface ScraperResult {
  federationId: number;
  races: ScrapedRace[];
  errors: ScraperError[];
  durationMs: number;
}

export interface ScraperError {
  url?: string;
  message: string;
  stack?: string;
}

export interface UpsertStats {
  inserted: number;
  updated: number;
  skipped: number;
}

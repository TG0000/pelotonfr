import type { Discipline, RaceLevel } from "./constants";

export interface ScrapedRace {
  externalId: string;
  name: string;
  raceDate: Date;
  raceDateEnd?: Date;

  /**
   * Location. Sources differ in what they can offer:
   *  - FFC publishes exact municipality coordinates but never a city name.
   *  - cyclisme-amateur publishes a town name but no coordinates.
   * Whichever is present is enough: the venue pipeline reverse-geocodes
   * coordinates and forward-geocodes names, so both converge on a real commune.
   */
  lat?: number;
  lng?: number;
  city?: string;
  departmentCode?: string;
  departmentName?: string;
  postcode?: string;

  discipline: Discipline;
  /** Exact wording used by the federation, e.g. "VTT - Enduro". */
  raceType?: string;
  level?: RaceLevel;
  categories: string[];
  gender?: "men" | "women" | "mixed";
  distanceKm?: number;

  /** Shared identifier between the FFC calendar and its results pages. */
  competitionCode?: string;

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

  /**
   * How far ahead this run is authoritative, in days.
   *
   * Within that horizon, a race the source no longer lists has been withdrawn,
   * so it can be retired. Beyond it, absence means only that the scrape did not
   * look that far, so those races must be left alone.
   */
  coverageDays?: number;
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

/**
 * UFOLEP scraper.
 *
 * Shares the cyclisme-amateur.com parser with FSGT.
 *
 * An earlier version also hit ufolep-cyclisme.org/calendrier, which has since
 * returned 404; that URL was removed rather than retried.
 */

import { scrapeCyclismeAmateur } from "./utils/cyclisme-amateur";
import type { ScraperResult } from "../../lib/scraper-types";

export async function scrapeUFOLEP(): Promise<ScraperResult> {
  return scrapeCyclismeAmateur({
    federationLabel: "UFOLEP",
    federationId: 3,
    idPrefix: "ufolep",
  });
}

/**
 * FSGT scraper.
 *
 * The FSGT calendar is published on cyclisme-amateur.com with the same layout
 * as UFOLEP's, so both share one parser.
 */

import { scrapeCyclismeAmateur } from "./utils/cyclisme-amateur";
import type { ScraperResult } from "../../lib/scraper-types";

export async function scrapeFSGT(): Promise<ScraperResult> {
  return scrapeCyclismeAmateur({
    federationLabel: "FSGT",
    federationId: 2,
    idPrefix: "fsgt",
  });
}

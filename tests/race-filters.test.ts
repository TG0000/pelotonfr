import { test } from "node:test";
import assert from "node:assert/strict";
import { validRaceFilters } from "../lib/race-filter-validation";

test("Calendar and API reject impossible dates, partial coordinates and unbounded filters", () => {
  for (const query of ["dateFrom=2026-02-30", "dateFrom=0000-01-01", "dateFrom=2026-10-01&dateTo=2026-09-01", "lat=Infinity&lng=0", "lat=49", "lat=91&lng=0", "page=1.5", "page=-1", "radius=999999", "q=" + "a".repeat(161), "cat=" + "a".repeat(65)]) {
    assert.equal(validRaceFilters(new URLSearchParams(query)), false, query);
  }
  for (const query of ["", "lat=0&lng=0&radius=50", "dateFrom=2028-02-29&dateTo=2028-03-01&page=2", "fed=ffc&cat=access1"]) {
    assert.equal(validRaceFilters(new URLSearchParams(query)), true, query);
  }
});

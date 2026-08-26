-- Season-long "races".
--
-- The FFC calendar sometimes publishes one competition code under a range that
-- covers several months, which the scraper stored verbatim as a multi-day race.
-- Such a row counts as in progress for the whole period: it leads every
-- upcoming list, pulls the calendar back to the opening month, and paints
-- itself across the month grid. The scraper now rejects spans beyond ten days
-- (see MAX_RACE_SPAN_DAYS); this repairs the rows written before it did.

UPDATE races
SET race_date_end = NULL
WHERE race_date_end IS NOT NULL
  AND (race_date_end - race_date) > 10;

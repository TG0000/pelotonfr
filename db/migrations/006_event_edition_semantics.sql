-- PelotonFR — Migration 006
-- An event groups races whose titles match once category suffixes are stripped.
-- That correctly collapses "Courcemont - Access 1", "- Access 2" and so on into
-- a single event, but it means the races of ONE meeting all land together —
-- so counting rows was counting category races, not editions. An event held
-- once, with six category races, was reported as six editions.
--
-- `edition_count` now counts distinct race dates (what a human calls an
-- edition) and `race_count` keeps the raw total.

ALTER TABLE events ADD COLUMN IF NOT EXISTS race_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN events.edition_count IS
  'Distinct dates this event has been held on — its actual editions.';
COMMENT ON COLUMN events.race_count IS
  'Total races linked, including the several category races of one edition.';

UPDATE events e
   SET edition_count = c.editions,
       race_count    = c.races
  FROM (
    SELECT event_id,
           COUNT(DISTINCT race_date) AS editions,
           COUNT(*)                  AS races
      FROM races
     WHERE event_id IS NOT NULL
     GROUP BY event_id
  ) c
 WHERE c.event_id = e.id;

CREATE INDEX IF NOT EXISTS idx_events_editions
  ON events (edition_count DESC) WHERE edition_count > 1;

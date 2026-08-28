-- When entries close.
--
-- The single most useful date on a French amateur race page, and the one
-- nobody sees in time. A licensed rider cannot enter a FFC race themselves —
-- the club officer holds the account — so a rider who decides on Wednesday for
-- Sunday has already missed it, and the officer only finds out by looking.
--
-- The federation states it on each competition page and it follows a rule:
-- 20h, three days before. Measured across a sample of upcoming races, without
-- exception. So it is derived for every race and overwritten by the stated
-- value wherever a page has been read — `entries_close_source` says which,
-- because a derived deadline is a good default and a bad thing to promise on.

ALTER TABLE races
  ADD COLUMN IF NOT EXISTS entries_close_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS entries_close_source VARCHAR(8);

UPDATE races
   SET entries_close_at = (race_date - INTERVAL '3 days') + TIME '20:00',
       entries_close_source = 'regle'
 WHERE federation_id = 1
   AND race_date >= CURRENT_DATE
   AND entries_close_at IS NULL;

CREATE INDEX IF NOT EXISTS races_entries_close_idx
  ON races (entries_close_at)
  WHERE entries_close_at IS NOT NULL;

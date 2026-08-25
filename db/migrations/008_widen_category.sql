-- PelotonFR — Migration 008
-- The national ranking does not only list racing categories: licence holders in
-- support roles appear too, with labels such as
-- "Encadrement Cyclisme Pro Assistant / Entraineur" — 47 characters, which
-- overflowed VARCHAR(40) and aborted the ingestion mid-season.
--
-- The column is widened rather than the value truncated: the label is the
-- federation's own wording and shortening it would silently distort it.

ALTER TABLE riders          ALTER COLUMN category TYPE VARCHAR(120);
ALTER TABLE rider_rankings  ALTER COLUMN category TYPE VARCHAR(120);

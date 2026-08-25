-- PelotonFR — Migration 009
-- A competition code identifies a race, not a running of it.
--
-- The FFC reuses the same code across seasons, and the season lives in the URL:
--   /resultats/resultat/2025/C5272150999/  → 66 finishers
--   /resultats/resultat/2026/C5272150999/  → 58 finishers, a different edition
--   /resultats/resultat/2027/C5272150999/  → not raced yet
--
-- Keying races on the code alone therefore collapsed every edition of a race
-- into one row: the calendar would overwrite a past edition's date with next
-- year's, while its classification stayed attached. 92 races ended up holding
-- results for a race that, per their own date, had not happened yet.
--
-- The identity becomes (season, code). `season` is stored rather than derived,
-- because it is the federation's own season — which does not follow the
-- calendar year, and whose boundary differs between road and cyclo-cross.

ALTER TABLE races ADD COLUMN IF NOT EXISTS season SMALLINT;

COMMENT ON COLUMN races.season IS
  'FFC season the edition belongs to, taken verbatim from the source URL. Part of
   the natural key together with competition_code.';

-- Backfill from the URL, which is authoritative.
UPDATE races
   SET season = substring(source_url from '/([0-9]{4})/')::int
 WHERE federation_id = 1
   AND source_url IS NOT NULL
   AND season IS NULL
   AND substring(source_url from '/([0-9]{4})/') IS NOT NULL;

-- Anything left over falls back to the calendar year of the race.
UPDATE races
   SET season = EXTRACT(YEAR FROM race_date)::int
 WHERE federation_id = 1 AND season IS NULL;

-- Re-key existing FFC races so a re-scrape updates them instead of inserting
-- duplicates alongside.
UPDATE races
   SET external_id = season || '-' || competition_code
 WHERE federation_id = 1
   AND competition_code IS NOT NULL
   AND season IS NOT NULL
   AND external_id NOT LIKE '%-%';

-- Results attached to a race that has not taken place belong to an earlier
-- edition which no longer has a row of its own. Drop them; the history and
-- results passes re-create them against the correct edition.
DELETE FROM race_results rr
 USING races ra
 WHERE ra.id = rr.race_id
   AND COALESCE(ra.race_date_end, ra.race_date) > CURRENT_DATE;

UPDATE races
   SET has_results = false, results_fetched_at = NULL, finisher_count = NULL
 WHERE COALESCE(race_date_end, race_date) > CURRENT_DATE
   AND has_results = true;

CREATE INDEX IF NOT EXISTS idx_races_season_code ON races (season, competition_code);

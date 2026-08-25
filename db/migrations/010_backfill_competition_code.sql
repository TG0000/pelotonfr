-- PelotonFR — Migration 010
-- Rows written by the first generation of the FFC scraper predate the
-- competition_code column: their external_id holds the bare code. Migration 009
-- could not re-key them because it keyed off competition_code.
--
-- Their external_id is the code, so it is copied across and then re-keyed the
-- same way as everything else.

UPDATE races
   SET competition_code = external_id
 WHERE federation_id = 1
   AND competition_code IS NULL
   AND external_id ~ '^C?[0-9]+$';

UPDATE races
   SET external_id = season || '-' || competition_code
 WHERE federation_id = 1
   AND competition_code IS NOT NULL
   AND season IS NOT NULL
   AND external_id !~ '^[0-9]{4}-';

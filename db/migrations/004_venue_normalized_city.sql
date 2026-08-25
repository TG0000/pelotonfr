-- PelotonFR — Migration 004
-- Venues are looked up by name when a source only publishes a town
-- ("Alençon", "ALENCON", "alencon" must all match one row). Comparing on the
-- raw `city` column would need unaccent() at query time on every row, so the
-- normalised form is stored and indexed instead.

ALTER TABLE venues ADD COLUMN IF NOT EXISTS normalized_city VARCHAR(180);

CREATE INDEX IF NOT EXISTS idx_venues_normalized_city
  ON venues (normalized_city, department_code);

COMMENT ON COLUMN venues.normalized_city IS
  'Lowercase, unaccented, punctuation-stripped city name used for lookups.';

-- PelotonFR — Migration 003
-- The FFC calendar exposes 11 distinct disciplines, several of which the
-- original CHECK constraint rejected (Gravel, Pump Track, the VTT sub-families
-- and the two Piste families).
--
-- Approach: `discipline` stays a coarse, filterable family and gains the two
-- genuinely missing families; the exact federation wording is preserved in
-- `race_type` so no fidelity is lost and the filter UI stays small.

ALTER TABLE races DROP CONSTRAINT IF EXISTS races_discipline_check;

ALTER TABLE races ADD CONSTRAINT races_discipline_check
  CHECK (discipline IN (
    'route',
    'contre_la_montre',
    'course_par_etapes',
    'cyclosportive',
    'gravel',
    'vtt',
    'cyclocross',
    'bmx',
    'pump_track',
    'piste'
  ));

-- Precise federation label, e.g. "VTT - Enduro" or "Piste Vitesse".
COMMENT ON COLUMN races.race_type IS
  'Exact discipline label as published by the federation; discipline holds the coarse family.';

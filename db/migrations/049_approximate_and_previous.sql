-- Une position approximative vaut mieux qu'aucune, si elle se dit.
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_geocoding_status_check;
ALTER TABLE races ADD CONSTRAINT races_geocoding_status_check
  CHECK (geocoding_status IN ('pending', 'success', 'failed', 'approximate'));

-- L'édition précédente d'une course : même commune, même semaine, même discipline, un an avant.
ALTER TABLE races ADD COLUMN IF NOT EXISTS previous_race_id uuid REFERENCES races(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS races_previous_idx ON races (previous_race_id) WHERE previous_race_id IS NOT NULL;

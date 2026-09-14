-- Les sources d'un tracé : la sortie du jour, une boucle parcourue un autre
-- jour, un segment reconnu, un dépôt, et le guide technique routé.
ALTER TABLE race_traces DROP CONSTRAINT IF EXISTS race_traces_source_check;
ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'parcouru', 'segment', 'depose', 'guide'));

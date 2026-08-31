-- Les courses par étapes.
--
-- La fédération enregistre un tour comme une seule compétition qui dure
-- plusieurs jours : le Tour de l'Orne est une ligne, du 12 au 13 septembre,
-- et ses trois étapes n'existent que dans le texte du descriptif. Un coureur,
-- lui, prépare trois parcours — dont un contre-la-montre.

CREATE TABLE IF NOT EXISTS race_stages (
  race_id      uuid    NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  stage_number int     NOT NULL,
  stage_date   date,
  start_place  text,
  finish_place text,
  distance_km  numeric(5,1),
  -- 'ligne' ou 'clm' : un chrono ne se prépare pas comme une course en ligne.
  kind         text,
  start_time   time,
  PRIMARY KEY (race_id, stage_number)
);

CREATE INDEX IF NOT EXISTS race_stages_date_idx ON race_stages (stage_date);

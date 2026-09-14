-- Le parcours de chaque étape d'un tour, reconstruit depuis le guide technique.
--
-- Le guide donne les points de passage kilométrés ; on les place, on les
-- relie par la route, on relit le relief. Une étape par ligne, parce qu'un
-- tour a autant de parcours que de jours.
CREATE TABLE IF NOT EXISTS race_stage_traces (
  race_id          uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  stage_number     int  NOT NULL,
  source           text NOT NULL DEFAULT 'guide',
  points           jsonb NOT NULL,
  distance_m       int,
  elevation_gain_m int,
  min_elevation_m  int,
  max_elevation_m  int,
  bounds           jsonb,
  -- Les points de passage placés, pour dire d'où vient le tracé.
  waypoints        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Le kilométrage du guide, pour dire si le routage colle.
  guide_km         numeric(6,1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (race_id, stage_number)
);

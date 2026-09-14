-- Où la photo a été prise, pour la poser sur la carte.
ALTER TABLE road_views ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE road_views ADD COLUMN IF NOT EXISTS lng double precision;

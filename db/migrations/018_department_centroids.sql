-- Coordinates that are not places.
--
-- For races discovered through the results index the FFC gives a single point
-- per department, not the race's own location: 131 Côtes-d'Armor races share
-- one coordinate, which reverse-geocodes to Saint-Donan although they are held
-- at Tréguidel, Noyal, Andel and Lescouët-Gouarec. Naming a venue from such a
-- point invents a town, and the interface then presents it as where the race
-- is run.
--
-- The break is clear in the data. A genuine commune venue holds a handful of
-- races — Flers 3, Argentan 1, Montluçon 9 — while every venue above twenty
-- turns out to be a department centroid: "Vaucluse" filed under department 25,
-- Marnes-la-Coquette holding the Ronde Avizoise, Montereau holding races from
-- Champs-sur-Yonne and Branches.
--
-- The points are kept: they place a race in the right department, which is
-- better than nothing on a map. What is removed is the claim that they name a
-- town.

ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_geo_precision_check;

ALTER TABLE venues
  ADD CONSTRAINT venues_geo_precision_check
  CHECK (geo_precision IN ('exact', 'municipality', 'department', 'unknown'));

WITH crowded AS (
  SELECT venue_id
  FROM races
  WHERE venue_id IS NOT NULL
  GROUP BY venue_id
  HAVING count(*) > 20
)
UPDATE venues v
SET geo_precision  = 'department',
    city           = NULL,
    normalized_city = NULL,
    postcode       = NULL
FROM crowded c
WHERE v.id = c.venue_id;

-- Races that took their town from one of those points never had one.
UPDATE races r
SET city = 'Lieu à préciser'
FROM venues v
WHERE v.id = r.venue_id AND v.geo_precision = 'department';

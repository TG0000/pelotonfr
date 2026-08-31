-- Un circuit qu'un coureur a parcouru, sans que ce fût le jour de la course.
--
-- Un coureur qui court depuis cinq ans a déjà fait la plupart des boucles de sa
-- région et les a nommées lui-même dans Strava. Ces sorties documentent le
-- circuit aussi bien que celle du jour J — mais pas la même chose : « relevé
-- par un coureur ayant disputé l'épreuve » serait faux pour une reconnaissance
-- de mars, et un tracé se juge sur ce qu'il est.

ALTER TABLE race_traces DROP CONSTRAINT IF EXISTS race_traces_source_check;
ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'segment', 'upload', 'organiser', 'depose', 'parcouru'));

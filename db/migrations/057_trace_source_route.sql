-- Un itinéraire dessiné par un coureur dans Strava, nommé comme la course.
ALTER TABLE race_traces DROP CONSTRAINT IF EXISTS race_traces_source_check;
ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'parcouru', 'segment', 'depose', 'guide', 'route'));

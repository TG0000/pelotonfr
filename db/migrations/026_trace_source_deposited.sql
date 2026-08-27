-- A circuit somebody put there on purpose.
--
-- Two sources so far, both inferred: a rider's ride matched to a race, and a
-- loop recognised among the sector's Strava segments. Both are guesses, and the
-- second was wrong twenty-nine times over — it picked the neighbouring
-- commune's circuit, which is worse than none because the reader cannot tell.
--
-- A deposited circuit is somebody saying "this is the course". It outranks both
-- and is never overwritten by either.

ALTER TABLE race_traces DROP CONSTRAINT IF EXISTS race_traces_source_check;
ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'segment', 'depose'));

-- Which Strava segment a deposited circuit came from, so it can be checked.
ALTER TABLE race_traces
  ADD COLUMN IF NOT EXISTS strava_segment BIGINT;

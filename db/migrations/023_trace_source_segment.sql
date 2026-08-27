-- A circuit recognised among Strava's segments is a fourth kind of source.
--
-- The table was written when the only imaginable trace came from a rider's own
-- recorded ride, an upload, or an organiser. Recognising the loop among the
-- segments of a sector came later, and the constraint silently refused every
-- one of them — the detection worked, the insert did not.

ALTER TABLE race_traces
  DROP CONSTRAINT IF EXISTS race_traces_source_check;

ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'segment', 'upload', 'organiser'));

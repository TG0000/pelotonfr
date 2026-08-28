-- The ground a circuit sits in.
--
-- The profile says how much a lap climbs. It cannot say what the lap is *in* —
-- whether the 77 metres are a wall out of a river valley or a long drag across
-- a plateau, which is the difference between a race that splits and one that
-- does not. A grid of heights around the circuit is what lets it be drawn in
-- relief instead of flat on a tile.
--
-- Kept on the trace rather than fetched on demand: it costs thirty-two
-- requests to the IGN and never changes.

ALTER TABLE race_traces
  ADD COLUMN IF NOT EXISTS ground JSONB;

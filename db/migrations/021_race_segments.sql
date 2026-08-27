-- The difficulties of the sector.
--
-- Strava's segment explorer answers for a geographic box, which is exactly the
-- question "what climbs will this race meet" — but it needs an athlete's token,
-- and almost no reader will have connected one. So the answer is fetched once
-- with whatever token is available and stored here: one connected rider unlocks
-- the reading for everyone, the same collector effect as the start lists and
-- the traces.
--
-- Kept per race rather than per point so a race that moves keeps its own
-- reading, and refreshed rarely: hills do not move.

CREATE TABLE IF NOT EXISTS race_segments (
  race_id        UUID        NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  segment_id     BIGINT      NOT NULL,
  name           VARCHAR(160) NOT NULL,
  distance_m     NUMERIC(8, 1) NOT NULL,
  average_grade  NUMERIC(4, 1) NOT NULL,
  elevation_m    NUMERIC(7, 1),
  climb_category SMALLINT,
  start_lat      DOUBLE PRECISION,
  start_lng      DOUBLE PRECISION,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (race_id, segment_id)
);

CREATE INDEX IF NOT EXISTS race_segments_race_idx
  ON race_segments (race_id, average_grade DESC);

-- Marks a race as having been looked at, so a sector with no climbs worth
-- naming is not re-queried on every pass.
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS segments_fetched_at TIMESTAMPTZ;

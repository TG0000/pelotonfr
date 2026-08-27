-- The shape of a course.
--
-- Organisers publish a trace roughly never. The only reliable source is a rider
-- who rode it: their activity carries the exact line the race took and the
-- ground it climbed. One rider documents the circuit for everyone, which is the
-- same collector effect that makes the start lists worth having.
--
-- Stored per race rather than per activity, because it is the course that is
-- interesting and not whose ride it came from. `contributed_by` is kept so a
-- rider can withdraw their own trace.

CREATE TABLE IF NOT EXISTS race_traces (
  race_id          UUID PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  contributed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  source           VARCHAR(20) NOT NULL DEFAULT 'strava'
                   CHECK (source IN ('strava', 'upload', 'organiser')),
  strava_activity  BIGINT,

  -- Simplified to what a map and a profile need: full streams are tens of
  -- thousands of points and no view ever draws them all.
  points           JSONB NOT NULL,

  distance_m       NUMERIC(10, 1),
  elevation_gain_m NUMERIC(8, 1),
  min_elevation_m  NUMERIC(8, 1),
  max_elevation_m  NUMERIC(8, 1),
  /** The bounding box, so a map can frame it without reading every point. */
  bounds           JSONB,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_traces_contributor_idx
  ON race_traces (contributed_by);

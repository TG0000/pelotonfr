-- PelotonFR — Migration 013
-- Strava activities, and the link between a ride and the race it was.
--
-- The value is not the ride on its own: it is joining what the rider actually
-- did — power, effort, distance — to the official classification and to the
-- field they faced. A rider knows they finished 12th; what they cannot see
-- anywhere today is that the winner carries 2637 ranking points, or that their
-- own normalised power that day was the highest of their season.
--
-- Matching a ride to a race is uncertain (a training ride can start beside a
-- race), so the link records how it was established and is never silently
-- assumed.

CREATE TABLE IF NOT EXISTS strava_activities (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id        BIGINT NOT NULL,

  name               VARCHAR(255),
  description        TEXT,
  sport_type         VARCHAR(40),
  started_at         TIMESTAMPTZ NOT NULL,
  /** Calendar date in the athlete's own timezone — what a race date compares to. */
  local_date         DATE NOT NULL,

  distance_m         NUMERIC(10, 1),
  moving_time_s      INTEGER,
  elevation_gain_m   NUMERIC(8, 1),
  average_watts      NUMERIC(7, 1),
  weighted_watts     NUMERIC(7, 1),
  max_watts          NUMERIC(7, 1),
  average_heartrate  NUMERIC(5, 1),
  max_heartrate      NUMERIC(5, 1),
  relative_effort    INTEGER,
  calories           INTEGER,
  start_location     GEOGRAPHY(Point, 4326),

  race_id            UUID REFERENCES races(id) ON DELETE SET NULL,
  race_match_method  VARCHAR(24) NOT NULL DEFAULT 'none'
                     CHECK (race_match_method IN ('none', 'manual', 'name_and_date', 'location_and_date')),

  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_strava_user_date ON strava_activities (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_strava_race     ON strava_activities (race_id);
CREATE INDEX IF NOT EXISTS idx_strava_start    ON strava_activities USING GIST (start_location);

-- Fitness snapshot, so a race can be weighed against the rider's actual level.
ALTER TABLE strava_connections ADD COLUMN IF NOT EXISTS ftp_updated_at TIMESTAMPTZ;
ALTER TABLE strava_connections ADD COLUMN IF NOT EXISTS athlete_name   VARCHAR(160);
ALTER TABLE strava_connections ADD COLUMN IF NOT EXISTS home_city      VARCHAR(160);

COMMENT ON COLUMN strava_activities.race_match_method IS
  'How the ride was tied to a race. A training ride can start beside a race, so
   the link is recorded rather than assumed.';

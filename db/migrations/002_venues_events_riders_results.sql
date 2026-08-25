-- PelotonFR — Migration 002
-- Introduces the domain model needed to go from "calendar aggregator"
-- to "performance ecosystem": venues, recurring events, clubs, riders,
-- public results, and placeholders for engagements / circuits.
--
-- Design notes
-- ------------
-- * `races` is kept as the *edition* table (one running of an event) so the
--   live app keeps working. New relations are added, nothing is dropped.
-- * `venues` is deduplicated by rounded coordinates: each physical location is
--   reverse-geocoded ONCE and then reused across every edition and every year.
--   This replaces per-race forward geocoding, which was both slow and wrong
--   (FFC only exposes a department name, never a city).
-- * `riders` is keyed on UCI ID, a stable national identifier present in the
--   public FFC results payload. It is what makes cross-edition competitor
--   analysis possible.
-- * `engagements` and `circuits` are modelled now but stay empty until a
--   lawful source exists (FFC start lists sit behind licensee auth).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- venues — one physical location, geocoded once, reused forever
-- ============================================================
CREATE TABLE IF NOT EXISTS venues (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Canonical commune identity (filled by reverse geocoding)
  city             VARCHAR(180),
  insee_code       VARCHAR(5),
  postcode         VARCHAR(10),
  department_code  VARCHAR(3),
  department_name  VARCHAR(100),
  region           VARCHAR(100),

  location         GEOGRAPHY(Point, 4326) NOT NULL,

  -- Dedup key: coordinates rounded to ~1km so the same town scraped from
  -- slightly different sources collapses into a single venue row.
  geo_key          VARCHAR(32) NOT NULL UNIQUE,

  -- How we learned the coordinates and how much we trust them
  geo_source       VARCHAR(24) NOT NULL DEFAULT 'unknown'
                   CHECK (geo_source IN ('unknown','ffc_marker','ban_reverse','ban_forward','dept_centroid','manual')),
  geo_precision    VARCHAR(16) NOT NULL DEFAULT 'unknown'
                   CHECK (geo_precision IN ('unknown','exact','municipality','department')),
  resolved_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_location   ON venues USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_venues_dept       ON venues (department_code);
CREATE INDEX IF NOT EXISTS idx_venues_unresolved ON venues (geo_precision) WHERE geo_precision = 'unknown';
CREATE INDEX IF NOT EXISTS idx_venues_city_trgm  ON venues USING GIN (city gin_trgm_ops);

-- ============================================================
-- clubs
-- ============================================================
CREATE TABLE IF NOT EXISTS clubs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  federation_id    SMALLINT REFERENCES federations(id),
  external_code    VARCHAR(32),
  name             VARCHAR(255) NOT NULL,
  normalized_name  VARCHAR(255) NOT NULL,
  department_code  VARCHAR(3),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (federation_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_clubs_name_trgm ON clubs USING GIN (name gin_trgm_ops);

-- ============================================================
-- events — the recurring identity behind editions
--   "GP de Dieulouard" exists across 2025 / 2026 / 2027
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  federation_id     SMALLINT NOT NULL REFERENCES federations(id),
  canonical_name    VARCHAR(400) NOT NULL,
  normalized_name   VARCHAR(400) NOT NULL,
  slug              VARCHAR(400),
  discipline        VARCHAR(50),
  primary_venue_id  UUID REFERENCES venues(id) ON DELETE SET NULL,
  organizer_club_id UUID REFERENCES clubs(id)  ON DELETE SET NULL,
  first_seen_year   SMALLINT,
  last_seen_year    SMALLINT,
  edition_count     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (federation_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_events_venue ON events (primary_venue_id);

-- ============================================================
-- races (existing table) — now linked to venue + event
-- ============================================================
ALTER TABLE races ADD COLUMN IF NOT EXISTS venue_id  UUID REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE races ADD COLUMN IF NOT EXISTS event_id  UUID REFERENCES events(id) ON DELETE SET NULL;

-- Competition code shared by the FFC calendar and results pages (e.g. C4654068024).
-- This is what lets us attach public results to the right edition.
ALTER TABLE races ADD COLUMN IF NOT EXISTS competition_code VARCHAR(32);

-- Results ingestion bookkeeping
ALTER TABLE races ADD COLUMN IF NOT EXISTS has_results      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE races ADD COLUMN IF NOT EXISTS results_fetched_at TIMESTAMPTZ;
ALTER TABLE races ADD COLUMN IF NOT EXISTS finisher_count   INTEGER;

CREATE INDEX IF NOT EXISTS idx_races_venue     ON races (venue_id);
CREATE INDEX IF NOT EXISTS idx_races_event     ON races (event_id);
CREATE INDEX IF NOT EXISTS idx_races_compcode  ON races (competition_code);
CREATE INDEX IF NOT EXISTS idx_races_pending_results
  ON races (race_date) WHERE has_results = false AND is_cancelled = false;

-- ============================================================
-- riders — keyed on UCI ID (stable, national, public)
-- ============================================================
CREATE TABLE IF NOT EXISTS riders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uci_id          VARCHAR(20) UNIQUE,
  last_name       VARCHAR(120) NOT NULL,
  first_name      VARCHAR(120),
  normalized_name VARCHAR(240) NOT NULL,
  gender          VARCHAR(10) CHECK (gender IS NULL OR gender IN ('men','women')),
  birth_year      SMALLINT,
  current_club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

  -- Denormalised aggregates, refreshed by the results pipeline.
  result_count    INTEGER NOT NULL DEFAULT 0,
  win_count       INTEGER NOT NULL DEFAULT 0,
  podium_count    INTEGER NOT NULL DEFAULT 0,
  last_raced_on   DATE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riders_name_trgm ON riders USING GIN (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_riders_club      ON riders (current_club_id);
CREATE INDEX IF NOT EXISTS idx_riders_lastraced ON riders (last_raced_on DESC);

-- ============================================================
-- race_results — public classification, the backbone of
-- competitor analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS race_results (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id            UUID NOT NULL REFERENCES races(id)  ON DELETE CASCADE,
  rider_id           UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- A single event publishes several "grids" (one per category bundle).
  grid_uid           VARCHAR(64),
  category_special   VARCHAR(80),
  phase              VARCHAR(80),

  rank               INTEGER,
  rank_global        INTEGER,
  finish_time        VARCHAR(20),
  points             NUMERIC(8,2),

  -- Club recorded at the time of the race (riders change clubs).
  club_id            UUID REFERENCES clubs(id) ON DELETE SET NULL,
  club_name_raw      VARCHAR(255),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (race_id, rider_id, grid_uid)
);

CREATE INDEX IF NOT EXISTS idx_results_race  ON race_results (race_id);
CREATE INDEX IF NOT EXISTS idx_results_rider ON race_results (rider_id, rank);
CREATE INDEX IF NOT EXISTS idx_results_club  ON race_results (club_id);

-- ============================================================
-- engagements — start lists.
-- Modelled now, populated only when a lawful source exists:
-- FFC start lists currently require licensee authentication.
-- ============================================================
CREATE TABLE IF NOT EXISTS engagements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id      UUID NOT NULL REFERENCES races(id)  ON DELETE CASCADE,
  rider_id     UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  bib          VARCHAR(12),
  club_id      UUID REFERENCES clubs(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered','confirmed','withdrawn','dns')),
  source       VARCHAR(40) NOT NULL DEFAULT 'unknown',
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_engagements_race ON engagements (race_id);

-- ============================================================
-- circuits — parcours intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS circuits (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id           UUID REFERENCES races(id)  ON DELETE CASCADE,
  event_id          UUID REFERENCES events(id) ON DELETE CASCADE,
  name              VARCHAR(255),
  distance_km       NUMERIC(7,2),
  lap_count         SMALLINT,
  lap_distance_km   NUMERIC(7,2),
  elevation_gain_m  INTEGER,
  max_gradient_pct  NUMERIC(5,2),
  difficulty_score  NUMERIC(5,2),
  profile_type      VARCHAR(24)
                    CHECK (profile_type IS NULL OR profile_type IN ('plat','vallonne','accidente','montagne')),
  geometry          GEOGRAPHY(LineString, 4326),
  elevation_profile JSONB,
  source            VARCHAR(40),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (race_id IS NOT NULL OR event_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_circuits_race  ON circuits (race_id);
CREATE INDEX IF NOT EXISTS idx_circuits_event ON circuits (event_id);

-- ============================================================
-- users — extended for Strava linkage, home location and plan tier
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_location    GEOGRAPHY(Point, 4326);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_id         UUID REFERENCES riders(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS uci_id           VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS federation_id    SMALLINT REFERENCES federations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS category         VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan             VARCHAR(20) NOT NULL DEFAULT 'free'
                                          CHECK (plan IN ('free','pro','team'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_athlete_id BIGINT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_home ON users USING GIST (home_location);

-- ============================================================
-- strava_connections — OAuth tokens, isolated from the users row
-- ============================================================
CREATE TABLE IF NOT EXISTS strava_connections (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  athlete_id        BIGINT NOT NULL UNIQUE,
  access_token      TEXT   NOT NULL,
  refresh_token     TEXT   NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  scope             TEXT,
  ftp_watts         INTEGER,
  weight_kg         NUMERIC(5,2),
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- alert_rules — "prévenez-moi des Access 3 à moins de 60 km"
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          VARCHAR(120),
  is_active      BOOLEAN NOT NULL DEFAULT true,

  -- Matching criteria
  federations    TEXT[] NOT NULL DEFAULT '{}',
  disciplines    TEXT[] NOT NULL DEFAULT '{}',
  categories     TEXT[] NOT NULL DEFAULT '{}',
  center         GEOGRAPHY(Point, 4326),
  radius_km      INTEGER NOT NULL DEFAULT 50,
  lead_time_days INTEGER NOT NULL DEFAULT 21,

  channel        VARCHAR(20) NOT NULL DEFAULT 'email'
                 CHECK (channel IN ('email','push')),
  last_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user   ON alert_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules (is_active) WHERE is_active = true;

-- Prevents sending the same race twice for the same rule.
CREATE TABLE IF NOT EXISTS alert_deliveries (
  rule_id      UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  race_id      UUID NOT NULL REFERENCES races(id)       ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, race_id)
);

-- ============================================================
-- Triggers
-- ============================================================
CREATE OR REPLACE TRIGGER venues_updated_at
  BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER events_updated_at
  BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER riders_updated_at
  BEFORE UPDATE ON riders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER circuits_updated_at
  BEFORE UPDATE ON circuits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER strava_connections_updated_at
  BEFORE UPDATE ON strava_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

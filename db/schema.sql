-- PelotonFR Database Schema
-- Run this against your Neon PostgreSQL database

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- federations
-- ============================================================
CREATE TABLE IF NOT EXISTS federations (
  id          SMALLINT PRIMARY KEY,
  slug        VARCHAR(10)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  website_url TEXT
);

INSERT INTO federations VALUES
  (1, 'ffc',    'Fédération Française de Cyclisme',                             'https://www.ffc.fr'),
  (2, 'fsgt',   'Fédération Sportive et Gymnique du Travail',                   'https://www.fsgt.org'),
  (3, 'ufolep', 'Union Française des Oeuvres Laïques d''Éducation Physique',   'https://www.ufolep.org')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- races
-- ============================================================
CREATE TABLE IF NOT EXISTS races (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id         VARCHAR(255) NOT NULL,
  federation_id       SMALLINT     NOT NULL REFERENCES federations(id),

  -- Core identity
  name                VARCHAR(500) NOT NULL,
  slug                VARCHAR(500),
  source_url          TEXT,

  -- Scheduling
  race_date           DATE         NOT NULL,
  race_date_end       DATE,

  -- Location
  city                VARCHAR(255) NOT NULL,
  department_code     VARCHAR(3),
  department_name     VARCHAR(100),
  region              VARCHAR(100),
  postcode            VARCHAR(10),
  location            GEOGRAPHY(Point, 4326),
  geocoding_status    VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (geocoding_status IN ('pending', 'success', 'failed')),

  -- Classification
  discipline          VARCHAR(50)  NOT NULL
                      CHECK (discipline IN ('route', 'contre_la_montre', 'course_par_etapes', 'cyclosportive', 'vtt', 'cyclocross', 'bmx', 'piste')),
  race_type           VARCHAR(100),
  level               VARCHAR(50)
                      CHECK (level IS NULL OR level IN ('international', 'national', 'regional', 'local')),
  categories          TEXT[]       NOT NULL DEFAULT '{}',
  gender              VARCHAR(10)  NOT NULL DEFAULT 'mixed'
                      CHECK (gender IN ('men', 'women', 'mixed')),
  distance_km         NUMERIC(6,1),

  -- Status
  is_cancelled        BOOLEAN      NOT NULL DEFAULT false,
  is_active           BOOLEAN      NOT NULL DEFAULT true,

  -- Metadata
  organizer           VARCHAR(255),
  contact_email       TEXT,
  contact_phone       VARCHAR(30),
  notes               TEXT,

  -- Deduplication
  content_hash        VARCHAR(64),

  -- Timestamps
  scraped_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (federation_id, external_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_races_race_date     ON races (race_date);
CREATE INDEX IF NOT EXISTS idx_races_federation    ON races (federation_id);
CREATE INDEX IF NOT EXISTS idx_races_discipline    ON races (discipline);
CREATE INDEX IF NOT EXISTS idx_races_is_active     ON races (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_races_geocoding     ON races (geocoding_status) WHERE geocoding_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_races_location      ON races USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_races_date_fed      ON races (race_date, federation_id, discipline)
  WHERE is_cancelled = false AND is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER races_updated_at
  BEFORE UPDATE ON races
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- scraper_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS scraper_logs (
  id              BIGSERIAL    PRIMARY KEY,
  federation_id   SMALLINT     REFERENCES federations(id),
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          VARCHAR(20)  NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'partial', 'failed')),
  races_found     INTEGER      NOT NULL DEFAULT 0,
  races_inserted  INTEGER      NOT NULL DEFAULT 0,
  races_updated   INTEGER      NOT NULL DEFAULT 0,
  races_skipped   INTEGER      NOT NULL DEFAULT 0,
  error_message   TEXT,
  metadata        JSONB
);

-- ============================================================
-- users  (linked to Clerk)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id         VARCHAR(255) NOT NULL UNIQUE,
  email            VARCHAR(255),
  display_name     VARCHAR(100),
  home_lat         NUMERIC(10, 7),
  home_lng         NUMERIC(10, 7),
  home_city        VARCHAR(255),
  default_radius_km INTEGER      NOT NULL DEFAULT 50,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- user_favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id     UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  race_id     UUID        NOT NULL REFERENCES races(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, race_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_race ON user_favorites (race_id);

-- PelotonFR — Migration 007
-- Official FFC rankings.
--
-- The federation publishes its national rankings through a public JSON endpoint
-- (api.ffc.fr/ajax/v1/classement/) carrying rank, points, UCI ID, name, club and
-- licence category, season by season. The UCI ID makes it join directly onto the
-- riders we already know from race classifications.
--
-- This gives two things the results alone cannot:
--   * points — results pages publish them in barely 1% of rows;
--   * licence category (Elite, Open 1, Access 3…), which is what a rider
--     actually races in and therefore what "who should I watch" must compare.
--
-- Keeping every season, rather than only the current one, is what lets us spot a
-- rider coming back after a break: strong points two seasons ago, quiet since.

CREATE TABLE IF NOT EXISTS rider_rankings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- FFC ranking identifier, e.g. HNATRT (men, national, road).
  ranking_type  VARCHAR(16) NOT NULL,
  season        SMALLINT    NOT NULL,

  uci_id        VARCHAR(20) NOT NULL,
  rider_id      UUID REFERENCES riders(id) ON DELETE SET NULL,

  rank          INTEGER,
  points        NUMERIC(10, 2),
  category      VARCHAR(40),

  club_name     VARCHAR(255),
  club_id       UUID REFERENCES clubs(id) ON DELETE SET NULL,
  licence_count SMALLINT,

  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ranking_type, season, uci_id)
);

CREATE INDEX IF NOT EXISTS idx_rankings_rider   ON rider_rankings (rider_id, season DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_uci     ON rider_rankings (uci_id);
CREATE INDEX IF NOT EXISTS idx_rankings_leaders ON rider_rankings (ranking_type, season, rank);
CREATE INDEX IF NOT EXISTS idx_rankings_points  ON rider_rankings (season, points DESC);

-- ============================================================
-- riders — denormalised ranking facts
-- ============================================================

-- Licence category as the federation records it, not as inferred from a title.
ALTER TABLE riders ADD COLUMN IF NOT EXISTS category        VARCHAR(40);

-- Current season standing.
ALTER TABLE riders ADD COLUMN IF NOT EXISTS current_points  NUMERIC(10, 2);
ALTER TABLE riders ADD COLUMN IF NOT EXISTS current_rank    INTEGER;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS current_season  SMALLINT;

-- Best standing ever recorded, which is what reveals a returning rider.
ALTER TABLE riders ADD COLUMN IF NOT EXISTS best_points     NUMERIC(10, 2);
ALTER TABLE riders ADD COLUMN IF NOT EXISTS best_rank       INTEGER;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS best_season     SMALLINT;

CREATE INDEX IF NOT EXISTS idx_riders_current_points ON riders (current_points DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_riders_best_points    ON riders (best_points DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_riders_category       ON riders (category);

COMMENT ON COLUMN riders.best_points IS
  'Highest season points ever recorded. Compared against current_points, a large
   gap identifies a rider returning from a stronger past.';

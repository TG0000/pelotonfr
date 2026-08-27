-- A race a rider is weighing up is not a race they are riding.
--
-- The table recorded a single flat "favourite", which conflates the two things
-- a rider actually does with a calendar: bookmark an epreuve they might do, and
-- commit to one they will. The difference matters — a season is built out of
-- the second list, and the first is a shortlist to choose from.
--
-- Everything already saved becomes "envisagée": it is the weaker claim, and
-- promoting a bookmark to a commitment on the rider's behalf would put races in
-- a plan they never agreed to.

ALTER TABLE user_favorites
  ADD COLUMN IF NOT EXISTS intent VARCHAR(12) NOT NULL DEFAULT 'envisagee'
  CHECK (intent IN ('envisagee', 'programmee'));

ALTER TABLE user_favorites
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_favorites_user_intent
  ON user_favorites (user_id, intent);

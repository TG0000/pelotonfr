-- The start lists we could not place, kept instead of counted.
--
-- The scraper already knew why each one failed; it printed the reason and moved
-- on, so the same sixty-odd lists failed identically every night with nobody
-- able to act on them. Written down, an unplaced list is a proposition: here is
-- a date, a commune, and the race that came closest. Confirming one attaches it
-- and the attachment holds for every run afterwards.

CREATE TABLE IF NOT EXISTS startlist_misses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path     TEXT NOT NULL UNIQUE,
  race_date       DATE,
  commune         TEXT,
  miss_reason     TEXT NOT NULL,
  -- The race that came closest, and how close. Null when nothing ran that day.
  best_race_id    UUID REFERENCES races(id) ON DELETE SET NULL,
  best_score      NUMERIC(4, 3),
  -- Set by hand from /etat. The scraper obeys it before its own matching, which
  -- is what turns one correction into a permanent one.
  resolved_race_id UUID REFERENCES races(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  -- A list for a race we will never carry — another federation, another region.
  -- Dismissed rather than deleted, so the next run does not re-queue it.
  dismissed_at    TIMESTAMPTZ,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The queue is read as "what is still open, newest race first".
CREATE INDEX IF NOT EXISTS startlist_misses_open_idx
  ON startlist_misses (race_date DESC)
  WHERE resolved_at IS NULL AND dismissed_at IS NULL;

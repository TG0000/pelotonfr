-- PelotonFR — Migration 005
-- Every "is this race still ahead of us?" filter now tests
-- COALESCE(race_date_end, race_date) so that a multi-day event stays visible
-- until its final day. Without a matching expression index those filters fall
-- back to a sequential scan.

CREATE INDEX IF NOT EXISTS idx_races_effective_end
  ON races ((COALESCE(race_date_end, race_date)))
  WHERE is_active = true AND is_cancelled = false;

-- Supports the common listing: upcoming races, filtered by federation and
-- discipline, ordered by start date.
CREATE INDEX IF NOT EXISTS idx_races_upcoming_listing
  ON races ((COALESCE(race_date_end, race_date)), federation_id, discipline, race_date)
  WHERE is_active = true AND is_cancelled = false;

-- PelotonFR — Migration 011
-- Start lists from the regional cycling press (vélopressecollection, covering
-- Bretagne / Normandie / Pays de la Loire).
--
-- Unlike the FFC results, this source publishes names and clubs but no UCI ID,
-- so a rider can only be matched by name. That is inherently uncertain —
-- homonyms exist — and the schema has to say so rather than pretend:
--
--   * rider_id becomes nullable: an unmatched entry is still worth showing,
--     with the name as published;
--   * the raw name, club and category are always kept, so a later, better
--     matcher can revisit the decision without re-scraping;
--   * match_method records how confident the link is, so the UI can present a
--     name-only match differently from a name-and-club one.

ALTER TABLE engagements ALTER COLUMN rider_id DROP NOT NULL;

ALTER TABLE engagements ADD COLUMN IF NOT EXISTS last_name_raw   VARCHAR(120);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS first_name_raw  VARCHAR(120);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS club_name_raw   VARCHAR(255);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS category_raw    VARCHAR(80);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS source_url      TEXT;

ALTER TABLE engagements ADD COLUMN IF NOT EXISTS match_method    VARCHAR(24)
  NOT NULL DEFAULT 'unmatched'
  CHECK (match_method IN ('unmatched', 'name_and_club', 'name_only', 'uci_id'));

-- The old key assumed a resolved rider. An entry can now exist without one, so
-- uniqueness is per race and published name instead.
ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_race_id_rider_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_engagements_race_person
  ON engagements (race_id, lower(coalesce(last_name_raw, '')), lower(coalesce(first_name_raw, '')));

CREATE INDEX IF NOT EXISTS idx_engagements_rider  ON engagements (rider_id);
CREATE INDEX IF NOT EXISTS idx_engagements_method ON engagements (match_method);

COMMENT ON COLUMN engagements.match_method IS
  'How the rider link was established. Name-based matches are not certain and
   should be presented as such.';

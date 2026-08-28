-- What the organiser says about their own race.
--
-- The nightly calendar scraper reads the list and the map and never opens a
-- competition's own page, deliberately: sixteen hundred detail pages a night is
-- what it was built to stop doing. But those pages carry three things nothing
-- else does — where to collect a dossard, at what time, and now and then the
-- circuit itself: "circuit de 7 km à parcourir 11 fois".
--
-- The last of those is the number the circuit search has been missing. Without
-- it a loop is judged on shape and proximity alone, which is how a race in
-- Argentan was given the circuit of the next commune. With it, a candidate
-- either matches the stated lap or it does not.
--
-- And the pickup address is a real point in the village rather than the
-- commune's centroid — the difference between "somewhere in Domfront" and
-- "rue du Champ Passais".

ALTER TABLE races
  ADD COLUMN IF NOT EXISTS bib_pickup_time  VARCHAR(8),
  ADD COLUMN IF NOT EXISTS bib_pickup_place VARCHAR(160),
  -- The stated lap, in metres, and how many times it is ridden.
  ADD COLUMN IF NOT EXISTS circuit_m        INTEGER,
  ADD COLUMN IF NOT EXISTS lap_count        SMALLINT,
  -- Where the race actually starts, when the address could be placed. Distinct
  -- from `location`, which is the commune and stays as the fallback.
  ADD COLUMN IF NOT EXISTS start_location   GEOGRAPHY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS briefing_fetched_at TIMESTAMPTZ;

-- Read in the same order the sector reader uses: what is still unread, soonest
-- first, so a rate-limited pass always spends itself on the next races.
CREATE INDEX IF NOT EXISTS races_briefing_pending_idx
  ON races (race_date)
  WHERE briefing_fetched_at IS NULL;

-- La première synchronisation doit remonter loin, les suivantes non.
--
-- La fenêtre était de 400 jours pour tout le monde : un coureur qui court
-- depuis cinq ans ne voyait remonter qu'une saison, et les quatre autres —
-- avec les circuits qu'il a déjà parcourus — restaient invisibles. Or c'est là
-- que se trouvent les tracés qui manquent aux pages course.
--
-- Remonter six ans à chaque synchronisation serait payer vingt appels pour
-- retrouver ce qu'on a déjà. La reprise se fait donc une fois, et se marque.

ALTER TABLE strava_connections
  ADD COLUMN IF NOT EXISTS backfilled_at TIMESTAMPTZ;

-- Ce que la vision a lu sur une photo de route Panoramax.
--
-- Une photo ne change plus : lue une fois, pour toujours, clé sur son
-- identifiant Panoramax. Une lecture ratée garde sa ligne (ok = false) pour
-- ne pas être retentée chaque nuit.
CREATE TABLE IF NOT EXISTS road_views (
  picture_id    text PRIMARY KEY,
  race_id       uuid REFERENCES races(id) ON DELETE SET NULL,
  along_m       int,
  taken_on      date,
  url           text NOT NULL,
  producer      text,
  ok            boolean NOT NULL DEFAULT true,
  reading       jsonb,
  model         text,
  input_tokens  int,
  output_tokens int,
  read_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS road_views_race_idx ON road_views (race_id, along_m);

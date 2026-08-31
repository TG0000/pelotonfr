-- Ce que la vision a lu sur une page de guide technique.
--
-- Une page scannée ne change plus jamais : elle est lue une fois et le
-- résultat vaut pour toujours. La clé est l'URL de l'image, pas la course, pour
-- qu'une même page rattachée à deux épreuves ne soit pas payée deux fois.
--
-- Une lecture ratée laisse quand même sa ligne, avec ok = false : sans ça le
-- prochain passage la relirait, et le suivant aussi.

CREATE TABLE IF NOT EXISTS guide_pages (
  page_url      text PRIMARY KEY,
  race_id       uuid REFERENCES races(id) ON DELETE CASCADE,
  page_number   int,
  ok            boolean NOT NULL DEFAULT true,
  kind          text,
  stage_number  int,
  points        jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence    real,
  model         text,
  input_tokens  int,
  output_tokens int,
  read_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_pages_race_idx ON guide_pages (race_id, page_number);

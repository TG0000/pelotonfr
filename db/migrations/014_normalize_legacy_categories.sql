-- Legacy capitalised category values.
--
-- An early scraper wrote the UI's own labels ("Open2", "Cadets") straight into
-- races.categories, while everything since normalises through lib/categories.ts
-- and writes lowercase canonical values ("open2", "u17"). Both spellings are
-- now in the table, so a filter on one silently misses the rows holding the
-- other. This folds the legacy spellings into the canonical vocabulary.

UPDATE races
SET categories = (
  SELECT array_agg(DISTINCT mapped ORDER BY mapped)
  FROM (
    SELECT CASE lower(cat)
             WHEN 'minimes'  THEN 'u15'
             WHEN 'cadets'   THEN 'u17'
             WHEN 'juniors'  THEN 'u19'
             WHEN 'benjamins' THEN 'u13'
             WHEN 'pupilles' THEN 'u11'
             WHEN 'poussins' THEN 'u9'
             ELSE lower(cat)
           END AS mapped
    FROM unnest(races.categories) AS cat
  ) AS m
)
WHERE EXISTS (
  SELECT 1 FROM unnest(categories) AS cat WHERE cat <> lower(cat)
);

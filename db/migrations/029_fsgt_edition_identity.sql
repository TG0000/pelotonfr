-- Gives every FSGT and UFOLEP race the date it was run on, in its identity.
--
-- The source's `/course-228043-` is the identifier of the *épreuve*, not of the
-- edition: the same number comes back every season with a new date. Keyed on
-- the number alone, the nightly upsert moved the existing row forward instead
-- of writing a new one — so "Maintenon", first collected in April 2026, now
-- carries April 2027, and its 2026 running is gone. Nothing was ever deleted;
-- every past race had simply been overwritten into the future, which is why the
-- archive held not one FSGT result.
--
-- Stamping the date onto the ids we already hold makes the rows distinguishable
-- so that the next collection adds to them instead of replacing them. The
-- seasons already lost cannot be recovered — the source publishes only what is
-- still to come — but from here they accumulate.

UPDATE races
   SET external_id = external_id || '-' || race_date::text
 WHERE federation_id IN (
         SELECT id FROM federations WHERE slug IN ('fsgt', 'ufolep')
       )
   AND external_id ~ '^(fsgt|ufolep)-\d+$';

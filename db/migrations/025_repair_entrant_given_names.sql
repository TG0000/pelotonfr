-- Puts the given names back in the column they belong to.
--
-- The start-list parser inferred column roles from the data, and required a
-- given name NOT to be capitalised to be recognised as one. Half the source's
-- tables write "DAHIREL | CÉLIANE": the pair was never formed, and the column of
-- given names was then swept up by the club fallback. The result was thousands
-- of entrants stored with no given name and a club reading "Yann" — and, with
-- only a surname to go on, no link to a rider.
--
-- The parser is fixed. This moves the value back for the rows where it survived.
-- Where the given name was dropped rather than misfiled, only re-collecting the
-- article can recover it; those rows are left as they are rather than guessed at.

-- Some of these races were collected again after the parser was fixed, so the
-- entrant already exists under their whole name. The broken row is then a stale
-- duplicate, not a record to repair: putting the given name back would collide
-- with the good row on (course, nom, prénom).
DELETE FROM engagements e
 WHERE e.first_name_raw IS NULL
   AND e.club_name_raw IS NOT NULL
   AND array_length(regexp_split_to_array(trim(e.club_name_raw), '\s+'), 1) <= 2
   AND EXISTS (
     SELECT 1 FROM engagements g
      WHERE g.race_id = e.race_id
        AND lower(g.last_name_raw) = lower(e.last_name_raw)
        AND lower(g.first_name_raw) = lower(trim(e.club_name_raw))
   );

UPDATE engagements
   SET first_name_raw = trim(club_name_raw),
       club_name_raw  = NULL
 WHERE first_name_raw IS NULL
   AND club_name_raw IS NOT NULL
   -- One or two words, and nothing that names a club: what is left is a person.
   AND array_length(regexp_split_to_array(trim(club_name_raw), '\s+'), 1) <= 2
   AND club_name_raw !~* '\y(uc|vc|cc|ac|ec|us|as|sc|cs|oc|team|velo|vélo|cycl|guidon|entente|union|amicale|olympique|etoile|étoile|pedale|pédale|roue|comite|comité|sport|club|racing|federation|fédération)\y';

-- A row whose surname was all we had could not have been matched on anything
-- else; the link is recomputed by the next collector run now that the name is
-- whole. Clearing the verdict is what makes it recompute.
UPDATE engagements
   SET match_method = 'unmatched', rider_id = NULL
 WHERE rider_id IS NULL AND match_method <> 'unmatched';

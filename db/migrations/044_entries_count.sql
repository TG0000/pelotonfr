-- Combien sont déjà engagés, avant même que la liste paraisse.
--
-- La fiche fédérale affiche « 74/150 places disponibles » : le nombre
-- d'engagés vivant, jour après jour. C'est la mesure la plus honnête de
-- l'attractivité d'une course — pas son nom, pas son affiche : qui y va.

ALTER TABLE races ADD COLUMN IF NOT EXISTS entries_engaged int;
ALTER TABLE races ADD COLUMN IF NOT EXISTS entries_capacity int;
ALTER TABLE races ADD COLUMN IF NOT EXISTS entries_counted_at timestamptz;

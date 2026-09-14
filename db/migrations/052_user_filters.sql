-- La recherche retenue d'un coureur suit son compte, pas son navigateur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS filters text;

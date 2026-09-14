-- Une personne, plusieurs adresses.
--
-- On se connecte par Google avec l'adresse Gmail, par lien magique avec
-- l'adresse iCloud : c'est la même personne, sa saison et son club doivent la
-- suivre quel que soit le chemin. Les adresses secondaires sont ici.

ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_emails text[] NOT NULL DEFAULT '{}';

-- L'heure de clôture des engagements est une heure de Paris, pas un instant.
--
-- La fiche FFC écrit « ouverts jusqu'au 24/09/2026 23h locale ». Le lecteur
-- gardait « 2026-09-24 23:00 » dans un timestamp sans fuseau ; sur le serveur,
-- qui tourne en UTC, cette valeur se relisait comme 23 h UTC, et la page la
-- rendait en heure de Paris : « Les engagements ferment vendredi 01:00 » pour
-- une porte qui se ferme le jeudi à 23 h. Deux heures de trop, et un jour de
-- décalage quand la clôture est le soir — soit à peu près toujours.
--
-- Invisible en local, où la machine est déjà à l'heure de Paris.
--
-- Les valeurs déjà en base sont des heures de Paris : on les convertit comme
-- telles, et la colonne porte désormais son fuseau.
ALTER TABLE races
  ALTER COLUMN entries_close_at TYPE timestamptz
  USING entries_close_at AT TIME ZONE 'Europe/Paris';

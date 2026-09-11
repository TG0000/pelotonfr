-- L'heure du premier départ, telle que l'organisateur l'écrit : « 13h ».
--
-- L'affiche de Landerneau ne dit ni circuit ni dossards, mais elle dit
-- « 1er départ 13h » — et le lecteur la rendait sans que rien ne la garde.
-- Un texte plutôt qu'une heure typée : « 13h30 », « 14 h », « 13h (U15) 15h
-- (U17) » sont tous des réponses honnêtes qu'un TIME ne sait pas porter.

ALTER TABLE races ADD COLUMN IF NOT EXISTS start_time varchar(40);

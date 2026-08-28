-- Le club de la saison en cours, pas celui d'il y a cinq ans.
--
-- Le collecteur de classements parcourt les saisons de la plus récente à la
-- plus ancienne, et son upsert garde ce qu'il vient d'écrire : `current_club_id`
-- finissait donc sur le club de 2021. Le rafraîchissement final remet points,
-- rang et catégorie à la saison courante — le club n'y figurait pas.
--
-- Rien n'échouait. Un coureur passé du VC Ferté-Macé à l'ES Caen en 2025 était
-- simplement présenté sous son ancien maillot, et la page club lui proposait de
-- rejoindre le mauvais.

UPDATE riders r
   SET current_club_id = c.club_id
  FROM rider_rankings c
 WHERE c.rider_id = r.id
   AND c.season = (SELECT MAX(season) FROM rider_rankings)
   AND c.club_id IS NOT NULL
   AND c.club_id IS DISTINCT FROM r.current_club_id;

-- Une course annulée reste une information.
--
-- Elle disparaissait des listes : un coureur qui l'avait programmée revenait,
-- ne la trouvait plus, et ne savait pas si elle était annulée ou si
-- l'application l'avait perdue. Les deux se ressemblent exactement, et c'est le
-- second qu'on redoute.
--
-- Elle reste donc affichée à sa date, barrée. `cancelled_at` dit quand on l'a
-- appris — « annulée, signalé il y a deux jours » se lit autrement qu'une
-- annulation de la veille de la course.

ALTER TABLE races
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Ce qu'on sait déjà : la date de constat est inconnue, mais l'annulation est
-- réelle. Faute de mieux, la dernière visite du collecteur.
UPDATE races SET cancelled_at = COALESCE(scraped_at, updated_at)
 WHERE is_cancelled AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS races_cancelled_idx
  ON races (race_date) WHERE is_cancelled;

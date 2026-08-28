-- Ce qui a déjà été rappelé.
--
-- `alert_deliveries` est clé sur (règle, course) : elle appartient aux alertes
-- du coureur et n'a pas de place pour un club. Réutiliser sa table aurait
-- mélangé deux choses qui se ressemblent de loin et se comportent
-- différemment de près — une alerte est une règle qu'on écrit, un rappel de
-- club est une échéance qui arrive.
--
-- Un rappel par course et par responsable. Pas de deuxième chance : un
-- responsable prévenu qui n'a pas engagé a décidé, ou a oublié, et le second
-- e-mail identique est ce qui apprend à ignorer le premier.

CREATE TABLE IF NOT EXISTS club_reminders (
  club_id   UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  race_id   UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, race_id, user_id)
);

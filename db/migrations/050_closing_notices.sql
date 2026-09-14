-- Un coureur est prévenu une fois que les engagements d'une course qu'il a
-- mise à son calendrier ferment bientôt. Une ligne par (coureur, course).
CREATE TABLE IF NOT EXISTS closing_notices (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  race_id  uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, race_id)
);

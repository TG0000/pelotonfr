-- Ce que le garde-fou des données a trouvé chaque nuit, et ce qu'il a réparé.
--
-- Une ligne par contrôle et par passage : le nombre trouvé, le nombre
-- corrigé d'office, et quelques exemples pour la console. C'est la mémoire
-- de ce qui casse, pour que la même erreur ne revienne pas sans être vue.
CREATE TABLE IF NOT EXISTS data_issues (
  id          bigserial PRIMARY KEY,
  run_at      timestamptz NOT NULL DEFAULT now(),
  check_name  text NOT NULL,
  found       int NOT NULL DEFAULT 0,
  fixed       int NOT NULL DEFAULT 0,
  sample      jsonb NOT NULL DEFAULT '[]'::jsonb,
  note        text
);
CREATE INDEX IF NOT EXISTS data_issues_run_idx ON data_issues (run_at DESC);

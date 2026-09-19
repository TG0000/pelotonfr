-- Un collecteur qui choisit de ne rien faire doit pouvoir le dire.
--
-- « Bosses Strava » était rouge depuis cinq jours sur la page d'état, et le
-- contrôle de nuit s'apprêtait à le signaler comme une panne. Il ne tombait
-- pas : il sortait volontairement, parce que la porte premium était fermée
-- dans l'environnement du job, et il sortait avant d'ouvrir sa ligne. Un
-- silence délibéré ne se distinguait pas d'une panne, ce qui est la façon la
-- plus sûre d'apprendre à ignorer le rouge.
ALTER TABLE collector_runs DROP CONSTRAINT IF EXISTS collector_runs_status_check;
ALTER TABLE collector_runs ADD CONSTRAINT collector_runs_status_check
  CHECK (status IN ('running', 'success', 'partial', 'failed', 'aborted', 'skipped'));

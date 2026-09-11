-- Un run tué par le système n'est ni réussi ni raté : il est abandonné.
--
-- Vingt-six runs de strava-segments sont restés « running » — un par nuit
-- depuis que le job dépasse ses 45 minutes et se fait tuer. Le chien de garde
-- voyait un collecteur toujours occupé, jamais en retard.

ALTER TABLE collector_runs DROP CONSTRAINT IF EXISTS collector_runs_status_check;
ALTER TABLE collector_runs ADD CONSTRAINT collector_runs_status_check
  CHECK (status IN ('running', 'success', 'partial', 'failed', 'aborted'));

UPDATE collector_runs
   SET status = 'aborted', finished_at = started_at + interval '1 hour',
       error_message = 'tué par le délai du job (rattrapage)'
 WHERE status = 'running' AND started_at < now() - interval '6 hours';

-- Puts back the two sources 026 dropped.
--
-- 026 added 'depose' by rewriting the list and wrote it from memory: 'upload'
-- and 'organiser', allowed since 023, were left out. No row used them yet, so
-- nothing broke — which is exactly why it would have gone unnoticed until the
-- day an organiser's own trace was refused by a constraint nobody was looking
-- at. Rewriting an enumeration means restating all of it.

ALTER TABLE race_traces DROP CONSTRAINT IF EXISTS race_traces_source_check;
ALTER TABLE race_traces
  ADD CONSTRAINT race_traces_source_check
  CHECK (source IN ('strava', 'segment', 'upload', 'organiser', 'depose'));

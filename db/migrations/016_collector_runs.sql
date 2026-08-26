-- Every collector reports, not just the three calendars.
--
-- scraper_logs was keyed by federation, so only the calendar scrapers could
-- write to it: results, rankings, start lists and category enrichment ran
-- unobserved. That is how the nightly job went 73 days without running while
-- every dashboard stayed green. This table is keyed by collector name instead,
-- and carries the existing history over.

CREATE TABLE IF NOT EXISTS collector_runs (
  id             BIGSERIAL    PRIMARY KEY,
  collector      VARCHAR(40)  NOT NULL,
  started_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         VARCHAR(20)  NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'partial', 'failed')),
  -- What the source offered, and what we managed to keep. A run that sees
  -- 263 lists and writes 30 is a success by exit code and a problem in fact.
  items_seen     INTEGER      NOT NULL DEFAULT 0,
  items_written  INTEGER      NOT NULL DEFAULT 0,
  error_message  TEXT,
  metadata       JSONB
);

CREATE INDEX IF NOT EXISTS collector_runs_recent_idx
  ON collector_runs (collector, started_at DESC);

-- Carry the calendar history across so the freshness check has a past to
-- compare against from its first run.
INSERT INTO collector_runs
  (collector, started_at, finished_at, status, items_seen, items_written,
   error_message, metadata)
SELECT
  'calendar-' || COALESCE(f.slug, 'unknown'),
  l.started_at, l.finished_at, l.status,
  l.races_found, l.races_inserted + l.races_updated,
  l.error_message, l.metadata
FROM scraper_logs l
LEFT JOIN federations f ON f.id = l.federation_id
WHERE NOT EXISTS (SELECT 1 FROM collector_runs);

DROP TABLE IF EXISTS scraper_logs;

-- A coverage result belongs to one exact trace. Legacy results are stale.
ALTER TABLE race_streetview ADD COLUMN IF NOT EXISTS trace_hash text;

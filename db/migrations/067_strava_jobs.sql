CREATE TABLE strava_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  after_at timestamptz NOT NULL, before_at timestamptz NOT NULL,
  page integer NOT NULL DEFAULT 1 CHECK(page>0),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting','completed','failed','cancelled')),
  synced integer NOT NULL DEFAULT 0, linked integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid, lease_until timestamptz, retry_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX strava_one_active_job ON strava_sync_jobs(user_id) WHERE status IN ('queued','running','waiting');
CREATE TABLE strava_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_encrypted text NOT NULL,
  attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

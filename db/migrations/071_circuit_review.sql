CREATE TABLE circuit_submissions (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 segment_id bigint NOT NULL,
 name text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by text
);
CREATE INDEX circuit_submissions_pending ON circuit_submissions(created_at) WHERE status='pending';
CREATE TABLE race_trace_versions (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by text NOT NULL
);

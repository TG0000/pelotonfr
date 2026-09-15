CREATE TABLE request_limits (
  key text PRIMARY KEY, count integer NOT NULL CHECK (count > 0), expires_at timestamptz NOT NULL
);
CREATE INDEX request_limits_expiry_idx ON request_limits(expires_at);
CREATE TABLE support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_hash text NOT NULL,
  category text NOT NULL CHECK (category IN ('support','confidentialite','club')),
  message text NOT NULL CHECK (length(message) BETWEEN 10 AND 5000),
  reply text,
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert','traite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_status_idx ON support_requests(status,created_at DESC);

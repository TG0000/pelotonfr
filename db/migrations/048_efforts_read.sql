-- Une sortie reliée à une course a été lue pour ses segments — une fois.
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS efforts_read_at timestamptz;

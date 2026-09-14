-- La météo prévue au départ, gardée pour la liste.
--
-- La page d'une course interroge la prévision en direct. La liste, elle,
-- en montre cent d'un coup et ne peut pas. Une ligne par course des sept
-- prochains jours, rafraîchie chaque nuit : vent, rafales, pluie, température
-- à l'heure du départ.

CREATE TABLE IF NOT EXISTS race_forecast (
  race_id       uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  for_date      date NOT NULL,
  wind_kmh      real,
  gust_kmh      real,
  wind_from_deg real,
  rain_pct      smallint,
  temp_c        real,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

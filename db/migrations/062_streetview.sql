-- Où Street View voit la boucle, et combien de fois on l'a ouvert aujourd'hui.
--
-- La couverture est lue une fois par course sur le point de terminaison
-- « metadata », qui ne coûte rien ; les ouvertures du panorama, elles, sont
-- comptées par jour pour ne jamais dépasser ce que Google offre.
CREATE TABLE IF NOT EXISTS race_streetview (
  race_id     uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  -- [{fromM, toM}] sur un tour : là où un panorama existe à moins de 40 m.
  spans       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sampled     int NOT NULL DEFAULT 0,
  covered_m   int NOT NULL DEFAULT 0,
  lap_m       int NOT NULL DEFAULT 0,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS streetview_loads (
  day   date PRIMARY KEY,
  n     int NOT NULL DEFAULT 0
);

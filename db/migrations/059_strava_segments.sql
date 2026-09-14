-- Les segments Strava tels que les sorties de nos coureurs les traversent.
--
-- L'explorateur de segments est fermé aux applications non approuvées. Mais
-- chaque sortie lue avec ses efforts nomme les segments qu'elle a traversés,
-- et un segment se lit ensuite par son identifiant, tracé compris. Un
-- coureur qui court depuis cinq ans a traversé les circuits de sa région :
-- voilà l'index qui remplace l'explorateur.
CREATE TABLE IF NOT EXISTS strava_segments (
  id              bigint PRIMARY KEY,
  name            text NOT NULL,
  distance_m      numeric(8,1),
  average_grade   numeric(4,1),
  elevation_m     numeric(7,1),
  climb_category  smallint,
  start           geography(Point, 4326),
  -- Le tracé, lu par segments/{id} quand on en a besoin ; NULL sinon.
  polyline        text,
  detail_at       timestamptz,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  -- Nombre de sorties qui l'ont traversé : un circuit de course l'est souvent.
  crossings       int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS strava_segments_start_idx ON strava_segments USING GIST (start);

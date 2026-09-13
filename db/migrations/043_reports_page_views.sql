-- Ce que les lecteurs signalent, et où ils sont.
--
-- Un coureur ou un organisateur voit une info manquante ou fausse avant nous :
-- un circuit qui n'est pas le bon, des engagés absents, une annulation.
-- Chaque signalement est une ligne à traiter, visible sur le tableau de bord.
--
-- Les vues de page ne gardent ni adresse IP ni identifiant : la commune que
-- l'hébergeur déduit, le chemin, l'heure. Assez pour voir qui lit le site en
-- ce moment, pas assez pour savoir qui.

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id     uuid REFERENCES races(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  message     text,
  contact     text,
  page        text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'traite', 'ignore')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  treated_at  timestamptz
);
CREATE INDEX IF NOT EXISTS reports_open_idx ON reports (created_at DESC) WHERE status = 'ouvert';

CREATE TABLE IF NOT EXISTS page_views (
  id          bigserial PRIMARY KEY,
  path        text NOT NULL,
  city        text,
  region      text,
  country     text,
  lat         double precision,
  lng         double precision,
  seen_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_views_seen_idx ON page_views (seen_at DESC);

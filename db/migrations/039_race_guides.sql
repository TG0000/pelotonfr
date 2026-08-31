-- Le guide technique d'une course par étapes.
--
-- C'est le seul document qui décrit vraiment un tour : l'itinéraire kilomètre
-- par kilomètre, les côtes classées, les sprints, les horaires de passage. Il
-- n'existe que scanné, une image par page, et il change chaque année — c'est
-- justement pour ça qu'aucun tracé n'est repris d'une édition à l'autre.

CREATE TABLE IF NOT EXISTS race_guides (
  race_id     uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  source_url  text NOT NULL,
  title       text,
  -- Les pages, dans l'ordre, en pleine résolution.
  page_urls   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Quand la vision a lu ces pages. NULL : jamais lu.
  read_at     timestamptz,
  found_at    timestamptz NOT NULL DEFAULT now()
);

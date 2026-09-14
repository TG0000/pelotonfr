-- Ce qu'on a appris sur un circuit après coup.
--
-- Une reconnaissance automatique (segment Strava, guide routé) est une
-- déduction. Quand une sortie de coureur arrive sur la même course, on compare
-- avant de remplacer : si la boucle déduite ne recouvre pas la boucle roulée,
-- la détection s'était trompée, et la console dit de combien et pourquoi.
CREATE TABLE IF NOT EXISTS trace_checks (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id         uuid REFERENCES races(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  old_source      text,
  old_ref         text,
  old_distance_m  int,
  new_source      text,
  new_ref         text,
  new_distance_m  int,
  -- Part des points de l'ancienne boucle à moins de 40 m de la nouvelle.
  overlap         real,
  -- 'confirme', 'faux', 'echauffement', 'audit'
  verdict         text NOT NULL,
  reason          text
);
CREATE INDEX IF NOT EXISTS trace_checks_race_idx ON trace_checks (race_id, checked_at DESC);

-- Un club, et qui y engage les coureurs.
--
-- En FFC un coureur ne s'engage pas lui-même : le responsable du club détient
-- le compte et saisit les engagements. Le club tient donc un tableur partagé où
-- chacun met une croix, et quelqu'un doit penser à l'ouvrir. Trois coûts, tous
-- invisibles dans le tableur : le responsable doit regarder régulièrement sans
-- que rien ne le prévienne, ça lui prend du temps même quand il n'y a rien, et
-- le coureur ne sait jamais si c'est fait.
--
-- L'appartenance est déclarée, pas déduite. La licence dit déjà de quel club un
-- coureur est (`riders.current_club_id`), mais elle ne dit pas qui engage, et
-- un coureur peut vouloir suivre son club sans y avoir sa licence à jour.

CREATE TABLE IF NOT EXISTS club_members (
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'coureur' demande, 'responsable' engage. Rien d'autre pour l'instant :
  -- un rôle de plus serait une hiérarchie que ces clubs n'ont pas.
  role       VARCHAR(12) NOT NULL DEFAULT 'coureur'
             CHECK (role IN ('coureur', 'responsable')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

-- « Qui sont mes coureurs » est la question du responsable, posée à chaque
-- ouverture de sa file.
CREATE INDEX IF NOT EXISTS club_members_user_idx ON club_members (user_id);

-- Ce que le responsable a déjà traité.
--
-- Sans ça, une course engagée reparaît dans la file jusqu'à ce que la liste des
-- partants soit publiée — deux à trois jours plus tard, soit après la clôture.
-- La file doit se vider quand le travail est fait, pas quand une source
-- extérieure le confirme.
CREATE TABLE IF NOT EXISTS club_entries (
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  race_id     UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  entered_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, race_id)
);

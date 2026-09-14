-- Le sens de la course à l'endroit de la photo, et comment la photo le regarde.
ALTER TABLE road_views ADD COLUMN IF NOT EXISTS bearing smallint;
ALTER TABLE road_views ADD COLUMN IF NOT EXISTS orientation text;

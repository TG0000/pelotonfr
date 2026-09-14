-- Le recadrage tel que la vision l'a vu, gardé pour être montré : une
-- sphérique entière est illisible, la fenêtre vers l'avant ne l'est pas.
ALTER TABLE road_views ADD COLUMN IF NOT EXISTS crop bytea;

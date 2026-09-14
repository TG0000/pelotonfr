-- Les vues de l'opérateur sont marquées, pour que les premiers lecteurs se
-- voient sans le bruit de celui qui construit le site.
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS operator boolean NOT NULL DEFAULT false;

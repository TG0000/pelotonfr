-- Les groupes dans lesquels un coureur s'aligne.
--
-- Un Open 2 court les « Open 1-2-3 », un Access 3 les « Access 1-2-3-4 » :
-- ce sont des groupes qui courent ensemble, et un coureur peut en avoir
-- plusieurs — un Open 3 qui descend en Access selon la course, un junior
-- qui s'aligne aussi en seniors.

ALTER TABLE users ADD COLUMN IF NOT EXISTS groups text[] NOT NULL DEFAULT '{}';

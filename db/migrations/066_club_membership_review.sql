-- Existing self-declared memberships remain recorded but require review before sharing.
ALTER TABLE club_members ADD COLUMN verified_at timestamptz;
ALTER TABLE club_members ADD COLUMN verified_by text REFERENCES "user"(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX club_one_verified_membership ON club_members(user_id) WHERE verified_at IS NOT NULL;

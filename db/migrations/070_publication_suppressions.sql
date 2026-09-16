-- Minimal durable matching keys, never a copy of the deleted sporting profile.
CREATE TABLE publication_suppressions (
  key_hash text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('uci','name')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text NOT NULL
);
CREATE FUNCTION publication_key(kind text, value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(kind || ':' || trim(regexp_replace(
    translate(lower(regexp_replace(coalesce(value,''), '\([^)]*\)', ' ', 'g')),
    'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z0-9]+', ' ', 'g')), 'UTF8')), 'hex')
$$;
CREATE FUNCTION prevent_suppressed_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb := to_jsonb(NEW); person text; uci text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(72400304);
  uci := item->>'uci_id';
  person := CASE WHEN TG_TABLE_NAME='riders' THEN concat_ws(' ',item->>'last_name',item->>'first_name')
                 WHEN TG_TABLE_NAME='engagements' THEN concat_ws(' ',item->>'last_name_raw',item->>'first_name_raw') END;
  IF EXISTS(SELECT 1 FROM publication_suppressions WHERE
      (uci IS NOT NULL AND key_hash=publication_key('uci',uci)) OR
      (person IS NOT NULL AND key_hash=publication_key('name',person))) THEN RETURN NULL; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER riders_suppression BEFORE INSERT OR UPDATE ON riders FOR EACH ROW EXECUTE FUNCTION prevent_suppressed_publication();
CREATE TRIGGER rankings_suppression BEFORE INSERT OR UPDATE ON rider_rankings FOR EACH ROW EXECUTE FUNCTION prevent_suppressed_publication();
CREATE TRIGGER engagements_suppression BEFORE INSERT OR UPDATE ON engagements FOR EACH ROW EXECUTE FUNCTION prevent_suppressed_publication();

-- Journal d'audit inaltérable (SEC-06). Rejoué après chaque migration par src/migrate.ts (idempotent).

-- Empreinte d'une ligne : contenu canonique + empreinte de la ligne précédente du même parti.
-- Même expression à l'écriture (déclencheur) et à la vérification (audit_log_verify).
CREATE OR REPLACE FUNCTION audit_log_row_hash(r audit_log) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(concat_ws('|',
    r.party_id::text, r.seq::text, coalesce(r.actor_user_id::text, ''), r.actor_kind, r.action,
    coalesce(r.target_type, ''), coalesce(r.target_id::text, ''), coalesce(r.metadata::text, ''),
    coalesce(r.ip, ''), to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), r.prev_hash
  ), 'sha256'), 'hex')
$$;

-- À l'insertion : numéro d'ordre et chaînage, sous un verrou par parti (deux écritures simultanées
-- ne peuvent pas prendre le même maillon).
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE last audit_log%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit_log:' || NEW.party_id::text, 0));
  SELECT * INTO last FROM audit_log WHERE party_id = NEW.party_id ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(last.seq, 0) + 1;
  NEW.prev_hash := coalesce(last.hash, '');
  NEW.created_at := now();
  NEW.hash := audit_log_row_hash(NEW);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul (SEC-06)' USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_log_chain ON audit_log;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Vérification de la chaîne d'un parti (lecture soumise à la RLS) : premier maillon cassé, ou NULL si intacte.
CREATE OR REPLACE FUNCTION audit_log_verify(p_party uuid)
RETURNS TABLE (checked bigint, broken_at bigint)
LANGUAGE sql STABLE AS $$
  WITH rows AS (
    SELECT a.seq, a.hash, a.prev_hash, audit_log_row_hash(a) AS expected,
           lag(a.hash) OVER (ORDER BY a.seq) AS prev_actual,
           lag(a.seq) OVER (ORDER BY a.seq) AS prev_seq
    FROM audit_log a WHERE a.party_id = p_party
  )
  SELECT count(*)::bigint,
         min(seq) FILTER (WHERE hash <> expected
                           OR prev_hash <> coalesce(prev_actual, '')
                           OR seq <> coalesce(prev_seq, 0) + 1)
  FROM rows
$$;

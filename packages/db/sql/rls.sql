-- Politiques d'isolation par parti (SOC-02, SEC-01). Rejoué après chaque migration par src/migrate.ts.
-- Toute table qui porte party_id reçoit automatiquement la politique ; aucune exception.
-- nullif : sur une connexion réutilisée par le pool, app.party_id vaut '' après la transaction (et non NULL) ;
-- sans nullif, ''::uuid lève une erreur au lieu de ne renvoyer aucune ligne.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'party_id' AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS party_isolation ON %I', r.table_name);
    EXECUTE format(
      'CREATE POLICY party_isolation ON %I USING (party_id = nullif(current_setting(''app.party_id'', true), '''')::uuid) WITH CHECK (party_id = nullif(current_setting(''app.party_id'', true), '''')::uuid)',
      r.table_name
    );
  END LOOP;
END $$;

-- La table parties elle-même : un parti ne voit que sa propre ligne.
-- Pas de FORCE ici : la fonction job_party_ids() (sql/jobs.sql), qui appartient au propriétaire, doit pouvoir
-- énumérer les identifiants des partis pour le worker. civora_app reste soumis à la RLS.
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS party_self ON parties;
CREATE POLICY party_self ON parties USING (id = nullif(current_setting('app.party_id', true), '')::uuid);

-- Recherches d'authentification, avant de connaître le parti (SEC-04). Lecture seule, une ligne précise à la fois :
-- le serveur fixe la valeur cherchée par SET LOCAL ; sans elle, ces politiques ne laissent rien voir.
-- Une session par l'empreinte SHA-256 de son jeton (jamais le jeton lui-même).
DROP POLICY IF EXISTS session_lookup ON sessions;
CREATE POLICY session_lookup ON sessions FOR SELECT
  USING (token_hash = nullif(current_setting('app.session_token_hash', true), ''));
-- Un parti par son identifiant public (slug), pour l'écran de connexion et le site du parti.
DROP POLICY IF EXISTS party_public_lookup ON parties;
CREATE POLICY party_public_lookup ON parties FOR SELECT
  USING (slug = nullif(current_setting('app.party_slug', true), ''));

-- Journal d'audit et journal des points : ajout seulement.
REVOKE UPDATE, DELETE ON audit_log FROM civora_app;
REVOKE UPDATE, DELETE ON point_ledger FROM civora_app;

-- Bulletins : jamais modifiés ni supprimés.
REVOKE UPDATE, DELETE ON ballots FROM civora_app;
REVOKE UPDATE, DELETE ON ballot_receipts FROM civora_app;

-- Référentiel territorial partagé : lecture seule pour l'application.
REVOKE INSERT, UPDATE, DELETE ON zones FROM civora_app;

-- Contrôle : échoue si une table métier n'a pas de politique (utilisé par check:rls en CI).
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.table_name, ', ') INTO missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'party_id'
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.table_name AND p.policyname = 'party_isolation');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans politique RLS : %', missing;
  END IF;
END $$;

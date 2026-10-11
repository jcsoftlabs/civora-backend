-- Politiques d'isolation par parti (SOC-02, SEC-01). Rejoué après chaque migration par src/migrate.ts.
-- Toute table qui porte party_id reçoit automatiquement la politique ; aucune exception.

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
      'CREATE POLICY party_isolation ON %I USING (party_id = current_setting(''app.party_id'', true)::uuid) WITH CHECK (party_id = current_setting(''app.party_id'', true)::uuid)',
      r.table_name
    );
  END LOOP;
END $$;

-- La table parties elle-même : un parti ne voit que sa propre ligne.
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS party_self ON parties;
CREATE POLICY party_self ON parties USING (id = current_setting('app.party_id', true)::uuid);

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

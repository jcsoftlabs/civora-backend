-- Console de l'éditeur (SOC-10, SEC-11). Rejoué après chaque migration par src/migrate.ts (idempotent).
-- Les tables du personnel n'ont pas de party_id : elles ne s'ouvrent qu'aux transactions marquées par
-- withConsole() (app.console = on). Une requête d'organisation, dans withParty(), ne les voit jamais.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_staff', 'staff_challenges', 'staff_sessions', 'platform_audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS console_only ON %I', t);
    EXECUTE format(
      'CREATE POLICY console_only ON %I USING (current_setting(''app.console'', true) = ''on'') WITH CHECK (current_setting(''app.console'', true) = ''on'')',
      t
    );
  END LOOP;
END $$;

-- Journal de la console : ajout seulement.
REVOKE UPDATE, DELETE ON platform_audit_log FROM civora_app;

-- Liste des organisations pour la console : identité et état, aucune donnée de membre. Le contenu de chaque
-- organisation reste derrière sa propre RLS ; la console n'en lit que des totaux, dans withParty().
CREATE OR REPLACE FUNCTION console_parties()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  organization_kind text,
  tier text,
  status text,
  created_at timestamptz,
  activated_at timestamptz,
  elections_module_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.slug, p.name, p.organization_kind, p.tier::text, p.status, p.created_at, p.activated_at,
         p.elections_module_until
  FROM parties p
  WHERE current_setting('app.console', true) = 'on'
  ORDER BY p.created_at DESC
$$;
REVOKE ALL ON FUNCTION console_parties() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console_parties() TO civora_app;

-- Tâches de fond (apps/worker). Rejoué après chaque migration par src/migrate.ts (idempotent).
-- Le schéma pgboss et les files sont créés par le propriétaire (src/jobs-schema.ts, juste avant ce fichier).
-- civora_app n'y reçoit que la lecture et l'écriture des jobs : aucune création de table ni de schéma.
REVOKE CREATE ON SCHEMA pgboss FROM civora_app;
GRANT USAGE ON SCHEMA pgboss TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO civora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO civora_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO civora_app;

-- Seule lecture transversale autorisée : la liste des identifiants des partis (rien d'autre), pour que les jobs
-- traitent chaque parti l'un après l'autre, chacun dans withParty().
CREATE OR REPLACE FUNCTION job_party_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM parties ORDER BY created_at
$$;
REVOKE ALL ON FUNCTION job_party_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION job_party_ids() TO civora_app;

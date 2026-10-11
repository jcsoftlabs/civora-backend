-- Rôles Postgres. Exécuté une fois par environnement, avant les migrations.
-- Les mots de passe viennent du gestionnaire de secrets, jamais de ce fichier.

CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_app') THEN
    CREATE ROLE civora_app LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_bi') THEN
    CREATE ROLE civora_bi LOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO civora_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO civora_app;

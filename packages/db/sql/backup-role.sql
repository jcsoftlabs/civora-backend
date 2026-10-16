-- Rôle des sauvegardes (NFR-06). À exécuter une fois par environnement avec le super-utilisateur de l'hébergeur :
-- seul lui peut accorder BYPASSRLS. Lecture seule de toutes les données (pg_read_all_data), y compris les tables
-- des partis malgré la RLS forcée ; aucune écriture, aucune création. Le mot de passe est fixé à part.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_backup') THEN
    CREATE ROLE civora_backup LOGIN BYPASSRLS;
  END IF;
END $$;
ALTER ROLE civora_backup LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
GRANT pg_read_all_data TO civora_backup;
ALTER ROLE civora_backup SET default_transaction_read_only = on;

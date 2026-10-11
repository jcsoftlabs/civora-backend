# apps/worker : tâches de fond (pg-boss)

Processus séparé de l'API. File pg-boss dans le schéma `pgboss` de Postgres (pas de Redis), connexion avec le
rôle `civora_app` (RLS appliquée). Les règles métier viennent de `@civora/api/jobs` : le worker n'en réimplémente
aucune.

- Un job traite les partis un par un (`listPartyIdsForJobs()`), chacun dans `withParty()`. L'échec d'un parti
  n'empêche pas les autres ; il est journalisé.
- Connexion : `DATABASE_URL_WORKER` (connexion directe recommandée), sinon `DATABASE_URL`.
- Ajouter un job : sa fonction dans `src/jobs.ts` (testée sans pg-boss), son entrée dans `JOBS`.

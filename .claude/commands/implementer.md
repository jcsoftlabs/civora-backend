---
description: Implémenter une ou plusieurs exigences du cahier des charges (ex. /implementer ADH-07 ADH-08)
argument-hint: <ID> [ID...]
---

Implémente les exigences : $ARGUMENTS

1. Lis leurs lignes dans `docs/requirements.md` (texte, palier, phase) et la section correspondante de `docs/roadmap.md`. Si une exigence est ambiguë ou contredit une règle de `CLAUDE.md`, pose la question avant de coder.
2. Lis `docs/architecture.md` pour les mécanismes concernés, et le `CLAUDE.md` de chaque application touchée.
3. Propose un plan court : tables et migrations, routes API, jobs, écrans web ou mobile, tests. Attends mon accord si le plan crée plus de deux tables ou touche aux paiements, aux votes ou à la sécurité.
4. Données : `party_id` sur chaque nouvelle table, migration Drizzle, et vérifie que `packages/db/sql/rls.sql` la couvre. Ajoute une fabrique pour le test d'isolation.
5. API : schémas zod, `requireFeature()` si l'exigence n'est pas dans tous les paliers (voir `packages/shared/src/plans.ts`), `authorize()` avec permission et zone, `withParty()` pour toute requête, audit si la permission est dans `AUDITED`.
6. Interfaces : charge le skill `ui-design` et suis sa checklist. Squelettes, états vides, erreurs, textes en fr et ht.
7. Tests : unitaires, intégration Postgres, isolation entre partis ; Playwright si c'est un parcours critique.
8. Termine en passant le statut à `fait` dans `docs/requirements.md`, en cochant la tâche dans `docs/roadmap.md`, puis lance `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm check:requirements`.

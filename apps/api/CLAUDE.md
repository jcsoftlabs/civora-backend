# apps/api : Fastify

## Structure

```
src/
  server.ts              démarrage, plugins, CORS en liste blanche, en-têtes de sécurité
  plugins/
    auth.ts              OTP, sessions, 2FA administrateurs (SEC-04, SEC-09)
    tenant.ts            partyId depuis le jeton, requireFeature, authorize(permission, zone)
    audit.ts             écriture dans audit_log
  modules/<module>/      routes.ts, service.ts, schemas.ts (zod), <module>.test.ts
  webhooks/              moncash.ts, natcash.ts, kashpaw.ts, stripe.ts
  realtime/              salles WebSocket par parti et par organe
  lib/                   crypto (chiffrement enveloppe), r2, resend, sms, fcm
```

Les jobs pg-boss vivent dans `apps/worker`, qui importe les services de `apps/api` via `@civora/api/jobs` (`src/jobs.ts`).

## Modules et exigences

| Module | Dossier | Exigences |
| --- | --- | --- |
| Espaces partis, abonnement, usage | `modules/parties` | SOC-01, SOC-03, SOC-04, SOC-07, SOC-08, SOC-09 |
| Territoire | `modules/territory` | SOC-05 |
| Membres et adhésions | `modules/members` | ADH-01 à ADH-12 |
| Organes et postes | `modules/organs` | ORG-01 à ORG-08, SOC-06 |
| Cotisations, dons, paiements | `modules/money` | FIN-01 à FIN-12 |
| Finances | `modules/finance` | CPT-01 à CPT-04 |
| Événements et présence | `modules/events` | ENG-03, ENG-04, PRE-01 à PRE-07 |
| Gamification | `modules/gamification` | GAM-01 à GAM-09 |
| Votes internes | `modules/votes` | VOT-01 à VOT-10 |
| Sondages, pétitions | `modules/surveys` | ENG-02, ENG-05 |
| Formation | `modules/training` | FOR-01 à FOR-04 |
| Publications, envois, messagerie | `modules/communication` | COM-01 à COM-06 |
| Documents | `modules/documents` | DOC-01 à DOC-08 |
| BI | `modules/bi` | BI-01 à BI-10, PIL-01 à PIL-04 |
| Élections | `modules/elections` | ELE-01 à ELE-18 |
| Synchronisation hors ligne | `modules/sync` | PRE-04, ELE-10, NFR-01 |
| Console éditeur | `modules/console` | SOC-10, SEC-11 |

## Règles

- Chaque route : schéma zod en entrée et en sortie, `requireFeature()` si l'exigence n'est pas dans tous les paliers, `authorize()` avec la permission et la zone.
- Tout accès aux données : `withParty(req.partyId, tx => ...)`. Interdit d'importer `db` directement dans un module.
- `partyId` vient du jeton, jamais du corps ni de l'URL.
- Webhooks : vérifier la signature, traiter de façon idempotente, répondre vite et déléguer le travail lourd à un job.
- Erreurs renvoyées au client : code stable + message traduisible, jamais de détail technique ni de donnée personnelle.
- Chaque module a ses tests ; les tests d'intégration tournent sur un vrai Postgres.
- **Sous-requêtes SQL** : dans un fragment `sql\`...\``, toujours qualifier les colonnes de la requête externe en clair (`"events"."organ_id"`), jamais `${events.organId}`. Sans jointure, drizzle n'écrit pas le nom de la table, et la colonne se lie alors à la table de la sous-requête si elle a une colonne du même nom (condition toujours vraie). Deux failles de visibilité évitées ainsi en P2.

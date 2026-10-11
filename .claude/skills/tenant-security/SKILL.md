---
name: tenant-security
description: Règles et vérifications d'isolation multi-partis, permissions par zone, chiffrement des pièces d'identité, secret du vote et audit. À charger pour toute nouvelle table, route API, export, job ou revue de sécurité.
---

# Isolation et sécurité

Le risque principal du produit est la confiance : un parti ne doit jamais voir les données d'un autre, et ni l'éditeur ni une autorité ne doivent pouvoir lire un fichier sans trace.

## Données
- Toute table métier porte `party_id uuid not null`. `rls.sql` applique automatiquement la politique `party_isolation` ; la migration échoue si une table en est privée.
- Les tables partagées sans `party_id` sont rares et en lecture seule pour `civora_app` (ex. `zones`). Toute nouvelle table partagée doit être justifiée par écrit dans la PR.
- Accès : uniquement `withParty(partyId, tx => ...)`. Jamais `db` directement dans un module. Jamais `SET` sans `LOCAL`.
- Test d'isolation : ajouter une fabrique dans `packages/db/test/factories` pour chaque nouvelle table.

## Permissions
- Deux couches : RLS (parti) puis `authorize(req, permission, zonePath)` (rôle et zone).
- Les droits viennent des postes occupés ; un poste a une portée territoriale ; un responsable voit sa zone et ses sous-zones (`ltree`).
- Une fonctionnalité hors palier renvoie `402 feature_not_in_plan` via `requireFeature()`.

## Données sensibles
- Pièces d'identité : chiffrement enveloppe, empreinte HMAC pour les doublons, lecture uniquement avec `identity.read` et audit.
- Logs : sérialiseurs masquant téléphones et identifiants ; aucun corps de requête complet en log.
- Exports et BI : jamais de pièce d'identité ; téléphones hachés ; chaque export audité.

## Vote secret
- `ballot_receipts` sait qui a voté ; `ballots` sait pour quoi ; aucune colonne ni horodatage ne permet de relier les deux.
- Résultats lisibles uniquement après `closesAt`. Journal public des empreintes de bulletins.

## Personnel de la plateforme
- La console éditeur ne lit que des agrégats (`usage_snapshots`, santé du service).
- Accès exceptionnel aux données d'un parti : `staff_access_requests` approuvée par le parti, limitée dans le temps, auditée.

## Secrets et surface d'attaque
- Aucun secret dans le dépôt (gitleaks en CI). Identifiants marchands stockés par référence au gestionnaire de secrets.
- CORS et WebSocket en liste blanche ; limitation du débit sur OTP et connexion ; 2FA pour les administrateurs.

---
description: Revue de sécurité des changements en cours avant fusion
---

Passe en revue les changements de la branche courante (`git diff main...HEAD`) avec le skill `tenant-security`. Vérifie et rapporte, fichier et ligne à l'appui :

1. Isolation : toute requête passe par `withParty()` ; aucune import direct de `db` dans un module ; nouvelles tables couvertes par la RLS et par le test d'isolation ; `partyId` jamais lu depuis le client.
2. Permissions : `authorize()` avec la bonne permission et la zone ; `requireFeature()` pour les fonctionnalités de palier.
3. Données sensibles : pièces d'identité chiffrées, jamais journalisées ni exportées ; audit des permissions sensibles ; logs masqués.
4. Votes : aucune jointure possible entre `ballots` et un membre ; résultats invisibles avant clôture.
5. Paiements : signature des webhooks vérifiée, idempotence, fonds vers les comptes du parti.
6. Secrets : aucun secret ou identifiant dans le code, la doc ou les tests. CORS et WebSocket en liste blanche.
7. Hors ligne : opérations idempotentes, horodatage d'origine conservé.

Classe chaque point en bloquant, à corriger, ou remarque. Ne modifie rien sans mon accord.

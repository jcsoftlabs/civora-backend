# Architecture

## Vue d'ensemble

```
App mobile (Flutter)  ─┐
Back-office (SvelteKit)├──> API Fastify ──> PostgreSQL (RLS) ──> réplique BI
Sites publics (SvelteKit)┘        │  └──> pg-boss (jobs)
                                  ├──> R2 (fichiers)   ├──> Resend
                                  ├──> MonCash, NatCash, KashPaw, Stripe
                                  └──> FCM, SMS, WhatsApp
```

Une seule base de code et une seule API servent tous les partis. Le palier ne fait qu'activer des fonctionnalités (`plans.ts`).

## 1. Isolation multi-partis

**Rôles Postgres**
- `civora_owner` : propriétaire des tables, migrations uniquement.
- `civora_app` : utilisé par l'API, soumis à RLS, sans `BYPASSRLS`.
- `civora_bi` : lecture seule sur les vues analytiques pseudonymisées de la réplique.

**Contexte de parti.** Toute requête applicative passe par :

```ts
await withParty(ctx.partyId, async (tx) => {
  // SET LOCAL app.party_id = '<uuid>' est exécuté au début de la transaction
  return tx.select().from(members);
});
```

`SET LOCAL` ne survit pas à la transaction, ce qui reste sûr avec un pooler. Les politiques RLS (`packages/db/sql/rls.sql`) comparent `party_id` à `current_setting('app.party_id')::uuid`. Une table sans politique fait échouer `check:rls` en CI.

**Test d'isolation générique.** `packages/db/test/isolation.test.ts` crée deux partis, insère une ligne par table pour chacun, puis vérifie, table par table, que le contexte A ne voit rien de B. Toute nouvelle table est automatiquement couverte.

**Fichiers.** Clés R2 sous `party/<party_id>/<module>/<uuid>`. L'API délivre des URL signées courtes ; jamais d'accès public direct sauf médias explicitement publiés.

**Temps réel.** Une salle WebSocket par parti, puis par organe ; le jeton porte `party_id` et l'abonnement est refusé hors de son parti. Origines en liste blanche.

## 2. Résolution du parti

- **Web** : `hooks.server.ts` lit l'hôte. `<slug>.civora.app` ou domaine personnalisé (table `party_domains`) vers `party_id`. La console éditeur vit sur `console.civora.app`.
- **Mobile** : application commune. Le membre rejoint un parti par QR code, lien d'invitation ou code ; le jeton de session porte `party_id` et l'app charge le thème. En marque blanche (palier National), le `party_id` est fixé à la compilation par le flavor.
- **API** : `party_id` vient toujours du jeton, jamais d'un paramètre envoyé par le client.

## 3. Permissions et territoire

- Zones en arbre : pays, département, commune, section communale, plus la diaspora (pays, ville). Colonne `path` de type `ltree` pour tester « zone dans sous-arbre » en une condition.
- Les droits viennent des postes occupés (`post_holders`) ; chaque poste porte un ensemble de permissions (`permissions.ts`) et une portée territoriale. Un trésorier de section ne voit que sa section.
- Vérification en deux couches : RLS pour le parti, `authorize(permission, zone)` dans l'API pour le rôle et la zone.

## 4. Données sensibles

- Chiffrement enveloppe : chaque parti a une clé de données (`party_keys`) chiffrée par la clé maîtresse (KMS). Les champs `nin`, `nif`, `passport`, `ssn` sont stockés chiffrés (AES-256-GCM) dans `member_identities`, avec une empreinte HMAC pour la recherche de doublons.
- Lecture d'une pièce : permission dédiée + ligne d'audit.
- Logs : sérialiseurs qui masquent téléphones et identifiants.

## 5. Votes internes

- `elections` (scrutin) et `election_rules` (corps électoral) ; la liste électorale figée est matérialisée dans `electoral_rolls`.
- Au vote : dans une même transaction, insertion d'un `ballot_receipts` (membre, scrutin, horodatage) et d'un `ballots` (scrutin, choix, jeton aléatoire), **sans lien** entre les deux. Contrainte d'unicité sur (scrutin, membre) dans les reçus.
- Les résultats ne sont lisibles qu'après clôture. Le journal vérifiable publie l'empreinte de chaque bulletin.

## 6. Paiements

1. Le client crée une intention de paiement (`payments` statut `pending`, clé d'idempotence).
2. Redirection vers MonCash, NatCash, KashPaw ou Stripe, avec les identifiants marchands **du parti**.
3. Webhook : vérification de signature, mise à jour idempotente, écriture comptable, points de gamification, reçu par e-mail.
4. Job `payments.reconcile` toutes les 5 minutes pour les paiements restés `pending`.

## 7. Jobs pg-boss

| Job | Fréquence | Rôle |
| --- | --- | --- |
| `payments.reconcile` | 5 min | Vérifier les paiements en attente |
| `dues.status` | chaque nuit | Statut à jour ou en retard, effets du retard (FIN-06, FIN-07) |
| `dues.reminders` | chaque jour | Rappels avant et après échéance |
| `notifications.fanout` | à la demande | Push, SMS, WhatsApp, e-mail ciblés |
| `import.members` | à la demande | Import, doublons, invitations (ADH-07 à ADH-09) |
| `gamification.award` | à la demande | Points depuis les événements métier |
| `usage.measure` | chaque nuit | Membres actifs, Go R2, SMS, e-mails par parti |
| `billing.overage` | mensuel | Facturer les dépassements |
| `storage.trash` | chaque jour | Vider les corbeilles de plus de 30 jours |
| `bi.refresh` | chaque nuit | Rafraîchir les vues analytiques |
| `exports.scheduled` | selon planning | Exports BI programmés |
| `elections.results` | temps réel | Consolider les PV |

## 8. Hors ligne et synchronisation

- Chaque saisie hors ligne (scan de présence, PV, fiche porte-à-porte) reçoit un UUID généré sur le téléphone et l'horodatage d'origine.
- L'app envoie une file d'opérations ; l'API applique chaque opération de façon idempotente (clé = UUID) et renvoie l'état.
- Le scan de présence hors ligne est contrôlé à la synchronisation (fenêtre horaire, jeton de QR valide pour la période).

## 9. Présence par QR

- Le QR affiché encode `event_id`, une période et une signature HMAC ; renouvelé toutes les 30 secondes (PRE-02). Le serveur accepte la période courante et la précédente.
- Option de géorepérage : position comparée au rayon de l'événement.

## 10. Usage et facturation

- Abonnement plateforme via Stripe Billing (palier, mensuel ou annuel).
- `usage_snapshots` quotidien par parti ; comparaison aux quotas de `plans.ts` ; alertes à 80 % et 100 % ; facturation des packs (50 Go à 10 USD) et des tranches de membres.

## 11. BI

- Réplique en lecture seule ; schéma `analytics` avec vues pseudonymisées (aucune pièce d'identité, téléphones hachés, aucun lien vote-votant).
- Palier National : entrepôt nocturne, compte de service Power BI ou Looker Studio, API de données en lecture seule par clé.

## 12. Langues

- Clés de traduction partagées (fr, ht, en, es) ; le contenu saisi par le parti est stocké par langue (`jsonb` { fr, ht, en, es }).

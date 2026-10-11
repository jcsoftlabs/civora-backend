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

**Activation sans redéploiement (SOC-07).** Les droits d'un parti (`Entitlements` : palier de `parties.tier`, option Élections, options et suspension du dernier abonnement) sont lus en base par `fetchEntitlements` et gardés 30 secondes dans `EntitlementsCache` ; le code qui change un palier appelle `invalidate(partyId)` pour un effet immédiat. `requireFeature()` répond 402 avec `requiredTier`, que l'interface affiche sur l'option verrouillée (composant `Locked`). Quotas : `checkQuota()` bloque les quotas stricts (administrateurs, formules, scrutins actifs) et mesure le dépassement des quotas facturés (membres, stockage).

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

`SET LOCAL` ne survit pas à la transaction, ce qui reste sûr avec un pooler. Les politiques utilisent `nullif(current_setting('app.party_id', true), '')` : sur une connexion réutilisée, le réglage vaut `''` et non `NULL`.

**PgBouncer.** En production, l'API et le worker passent par PgBouncer en mode transaction (port 6432) avec `DATABASE_PGBOUNCER=true` (requêtes préparées désactivées). Les migrations utilisent toujours la connexion directe : `migrate.ts` refuse une URL PgBouncer. Au démarrage, l'API refuse un rôle super-utilisateur ou `BYPASSRLS` (`assertAppRole`) : le compte `postgres` fourni par l'hébergeur ne doit jamais servir à l'application.

**Références entre tables.** La RLS ne contrôle que le `party_id` de la ligne écrite. Chaque référence interne est donc une clé étrangère composite `(party_id, x_id)` vers `(party_id, id)` (helpers `partyKey` et `sameParty`) : une ligne ne peut pas pointer vers les données d'un autre parti. Les contraintes d'unicité métier incluent `party_id`, pour qu'une collision ne révèle rien d'un autre parti. Un compte (`users`) n'adhère qu'à un seul parti (`members.user_id` unique). Les politiques RLS (`packages/db/sql/rls.sql`) comparent `party_id` à `current_setting('app.party_id')::uuid`. Une table sans politique fait échouer `check:rls` en CI.

**Test d'isolation générique.** `packages/db/test/isolation.test.ts` crée deux partis, insère une ligne par table pour chacun, puis vérifie, table par table, que le contexte A ne voit rien de B. Toute nouvelle table est automatiquement couverte.

**Fichiers.** Clés R2 sous `party/<party_id>/<module>/<uuid>`. L'API délivre des URL signées courtes ; jamais d'accès public direct sauf médias explicitement publiés.

**Temps réel.** Une salle WebSocket par parti, puis par organe ; le jeton porte `party_id` et l'abonnement est refusé hors de son parti. Origines en liste blanche.

## 2. Résolution du parti

- **Web** : `hooks.server.ts` lit l'hôte. `<slug>.civora.app` ou domaine personnalisé (table `party_domains`) vers `party_id`. La console éditeur vit sur `console.civora.app`.
- **Mobile** : application commune. Le membre rejoint un parti par QR code, lien d'invitation ou code ; le jeton de session porte `party_id` et l'app charge le thème. En marque blanche (palier National), le `party_id` est fixé à la compilation par le flavor.
- **API** : `party_id` vient toujours du jeton, jamais d'un paramètre envoyé par le client.

## 2 bis. Authentification (SEC-04, SEC-09)

- **Code à usage unique** envoyé par **e-mail par défaut**. Le SMS est payant : chaque parti l'active lui-même (`parties.otp_channels`) et choisit son fournisseur via l'adaptateur `SmsSender` (`apps/api/src/lib/messaging/sms.ts`). La connexion se fait toujours dans un parti (`partySlug`) : un compte n'adhère qu'à un parti.
- Code de 6 chiffres, valable 10 minutes, 5 essais, 5 codes par compte et par quart d'heure ; seule une empreinte HMAC (`AUTH_SECRET`) est stockée. La réponse est identique que le compte existe ou non. Débit limité par adresse IP sur chaque étape.
- **Sessions en base** (`sessions`) : jeton aléatoire de 32 octets, seule l'empreinte SHA-256 est stockée ; révocables une à une ou toutes ensemble. 30 jours pour un membre, 7 jours pour un administrateur. Le jeton est envoyé en `Authorization: Bearer` (application mobile, serveur SvelteKit).
- **Double authentification** obligatoire pour tout membre qui occupe un poste avec des permissions : application d'authentification (TOTP), secret chiffré avec la clé du parti, code utilisable une seule fois. Tant qu'elle n'est pas validée, la session n'a aucun droit (`mfa_required`) ; un code e-mail ne permet pas de réinscrire une 2FA existante.
- Recherches avant de connaître le parti : politiques RLS dédiées en lecture seule (`session_lookup` par empreinte de jeton, `party_public_lookup` par slug), via `withAuthLookup()`.

## 3. Permissions et territoire

- Zones en arbre : pays, département, commune, section communale, plus la diaspora (racine, pays, ville). Colonne `path` de type `ltree`, construite à partir des codes officiels (`ht.ht01.ht0114.ht0114_01`, `diaspora.us.mia`), pour tester « zone dans sous-arbre » en une condition.
- Référentiel : `packages/db/data/zones-ht.json`, généré par `packages/db/scripts/build-zones.py` depuis le jeu de données officiel du **CNIGS** (« Haiti - Subnational Administrative Boundaries », HDX, licence **CC BY-IGO** : citer « Données territoriales : CNIGS » dans les mentions de l'application). 10 départements, 140 communes (codification 2018), 570 sections communales, noms créoles des départements et communes. La diaspora (`zones-diaspora.json`) est tenue à la main. Chargement idempotent à chaque migration (`syncZones`), une requête par niveau. Lecture publique : `GET /zones`, `/zones/search` (sans accents, nom français ou créole), `/zones/:code` (fil d'Ariane).
- Profondeur selon le palier (`structureLevels`, `packages/shared/src/territory.ts`) pour les organes et les postes : Essentiel = national et communes ; Mouvement ajoute départements et villes de la diaspora ; National ajoute les sections communales. Un membre se localise toujours jusqu'à la section communale.
- Les droits viennent des postes occupés (`post_holders`) ; chaque poste porte un ensemble de permissions (`permissions.ts`) et une portée territoriale. Un trésorier de section ne voit que sa section.
- Vérification en deux couches : RLS pour le parti, `authorize(permission, zone)` dans l'API pour le rôle et la zone.

## 4. Données sensibles

- Chiffrement enveloppe : chaque parti a une clé de données (`party_keys`) chiffrée par la clé maîtresse (KMS). Les champs `nin`, `nif`, `passport`, `ssn` sont stockés chiffrés (AES-256-GCM) dans `member_identities`, avec une empreinte HMAC pour la recherche de doublons.
- Lecture d'une pièce : permission dédiée + ligne d'audit.
- Mise en œuvre (`apps/api/src/lib/crypto.ts`, `party-keys.ts`, `modules/members/identity.ts`) : la clé maîtresse est derrière l'interface `KeyProvider` (`LocalKeyProvider` lit `KMS_MASTER_KEY`, trousseau versionné ; un KMS managé s'y branche sans changer le reste). La clé du parti est créée au premier usage, versionnée (`rotate()`), et deux sous-clés en sont dérivées par HKDF : chiffrement et empreintes. Le chiffré est lié à sa ligne (parti, membre, type, version de clé) : recopié sur une autre ligne, il devient illisible. Les doublons comparent des empreintes HMAC du numéro normalisé, une par version de clé, sans rien déchiffrer. La lecture exige `identity.read` dans la zone du membre et écrit `audit_log` dans la même transaction.
- Transit (SEC-03) : HTTPS et HSTS côté API ; `DATABASE_SSL=require` dès que la base est jointe par le réseau public. Au repos : chiffrement de l'hébergeur (Postgres managé, R2), à vérifier à la mise en production.
- Logs : sérialiseurs qui masquent téléphones et identifiants.

## 4 bis. Journal d'audit (SEC-06)

- `audit_log` est en ajout seul pour tous : `REVOKE` pour `civora_app`, et des déclencheurs (`sql/audit.sql`) qui refusent `UPDATE`, `DELETE` et `TRUNCATE` même au propriétaire de la table. Seul un super-utilisateur peut les contourner (`session_replication_role`), ce que la chaîne d'empreintes révèle.
- Chaîne par parti : à l'insertion, la base attribue `seq` (verrou par parti, sans trou ni doublon), relie la ligne à l'empreinte de la précédente (`prev_hash`) et calcule `hash` (SHA-256 du contenu canonique). Les valeurs fournies par l'appelant sont ignorées.
- `audit_log_verify(party)` renvoie le premier maillon modifié, retiré ou intercalé ; exposé par `GET /audit/verify` (permission `audit.read`, poste national). `GET /audit` liste le journal sans donnée personnelle.
- Écrit dans la même transaction que l'action : lecture d'une pièce d'identité, connexion, verrouillage d'un code après 5 essais, activation de la 2FA, révocation des sessions ; puis exports, changements de poste et réglages au fil des modules (`AUDITED`).

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

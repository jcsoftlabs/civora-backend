# Feuille de route

Quatre phases sur dix mois, puis des extensions. Chaque phase se ferme par un jalon vérifiable. Les tâches sont à donner à Claude Code dans l'ordre, une à la fois, avec `/implementer <ID>` quand elles portent un identifiant.

## P1 : Fondations (mois 1)

Jalon : audit de sécurité validé (aucun secret détecté, chaque brique reconstruite depuis son dépôt, CI au vert).

- [ ] Hors dépôt : révoquer et régénérer le jeton GitHub, les identifiants de base et les clés de signature exposés dans NOU ; versionner nou-ansanm (SEC-07)
- [x] Initialiser le monorepo pnpm : apps/api, apps/web, packages/db, packages/shared, packages/ui
- [x] CI GitHub Actions : lint, typecheck, migrations, tests, gitleaks, `check:requirements`
- [x] Postgres local (docker compose, ou `scripts/db-local.sh` sans Docker) avec les rôles `civora_owner`, `civora_app`, `civora_bi`
- [x] Fastify : serveur, configuration, CORS en liste blanche, en-têtes de sécurité, journalisation sans données personnelles (SEC-08)
- [x] SvelteKit : application vide branchée sur `docs/design/tokens.css`, polices Bricolage Grotesque et Geist
- [x] Squelette de chargement et composants de base dans packages/ui (bouton, champ, interrupteur, pastille, tableau, panneau latéral)

## P2 : Socle SaaS (mois 2 à 4)

Jalon : NOU migré sans perte, tests d'isolation réussis entre deux partis fictifs.

### Tenancy et sécurité
- [x] Schéma `parties`, `subscriptions`, `party_keys` ; helper `withParty()` ; politiques RLS ; test d'isolation générique appliqué à toutes les tables (SOC-02, SEC-01)
- [x] Plans et activation des modules : `plans.ts`, `requireFeature()`, `hasFeature()` (SOC-07)
- [x] Chiffrement enveloppe des pièces d'identité (SEC-02, SEC-03)
- [x] Authentification : OTP par e-mail (SMS au choix du parti), sessions, 2FA obligatoire pour les administrateurs, limitation du débit (SEC-04, SEC-09)
- [x] Journal d'audit append-only (SEC-06)

### Territoire, organes, permissions
- [x] Référentiel des 10 départements, communes, sections communales ; pays de la diaspora (SOC-05)
- [x] Organes, postes, droits attachés au poste, visibilité par zone (ORG-01 à ORG-04, SOC-06, SEC-05)

### Membres et argent
- [ ] Inscription mobile, fiche membre, statuts configurables, mode d'adhésion (ADH-01 à ADH-04) : API faite ; photo (stockage R2) et écrans mobiles à faire
- [x] Validation des adhésions, export journalisé (ADH-06, ADH-12)
- [x] Formules de cotisation, échéances (FIN-03, FIN-05)
- [ ] MonCash, NatCash, KashPaw : webhooks, job de vérification, idempotence, comptes marchands du parti (FIN-01, FIN-12)
- [ ] Saisie des espèces par un trésorier, reçu (FIN-10)

### Communication et pilotage
- [ ] Annonces, actualités, podcasts, albums multi-partis (COM-01)
- [ ] Notifications push ciblées (COM-02)
- [ ] Agenda et événements (ENG-03)
- [ ] Statistiques par zone (PIL-01)

### Interfaces
- [ ] Back-office : rail de navigation, liste des membres, organes avec panneau latéral (maquettes « Back-office »)
- [ ] Création d'un espace parti et thème marque blanche web (SOC-01, SOC-03)
- [ ] App mobile commune : rejoindre un parti par QR, lien ou code ; thème chargé selon le parti ; accueil membre (maquette « App membre : accueil »)
- [ ] Hors ligne de base et Android 8 (NFR-01, NFR-02) ; français et créole (NFR-08) ; squelettes (NFR-09)

### Migration
- [ ] Script de migration NOU vers civora (membres, cotisations, formations, contenus), contrôle de concordance avant et après

## P3 : Lancement (mois 5 et 6)

Jalon : deux partis pilotes actifs et facturés ; création d'un espace parti en moins d'une heure.

- [ ] Facturation plateforme : abonnements Stripe, factures, relances, suspension, mesure de l'usage et dépassements (SOC-08)
- [ ] Assistant de démarrage et import : correspondance des colonnes, doublons, invitations, historique des cotisations (SOC-09, ADH-07 à ADH-10)
- [ ] Parrainage configurable (ADH-05, ENG-01) ; carte de membre QR vérifiable (ADH-11)
- [ ] Cotisations avancées : montants différenciés, rappels, effets du retard, paiement d'avance, Stripe diaspora, campagnes de dons (FIN-02, FIN-04, FIN-06 à FIN-08, FIN-11)
- [ ] Présence aux rassemblements : QR tournant, fenêtre et géorepérage, hors ligne, mode inverse, liste temps réel (PRE-01 à PRE-07)
- [ ] Gamification : barème, bonus, badges, classements, journal (GAM-01 à GAM-05, GAM-09)
- [ ] Votes internes : corps électoral par règles, liste figée, candidatures, modes, quorum, PV, installation du gagnant (VOT-01 à VOT-07, VOT-09, VOT-10)
- [ ] Organes avancés : mandats, organigramme, pourvoi par vote, organes secrets et canaux (ORG-05 à ORG-08)
- [ ] Formation : modules, quiz, obligations par statut, suivi (FOR-01 à FOR-03)
- [ ] SMS et WhatsApp sur crédits (COM-03) ; messagerie et support (COM-06) ; sondages (ENG-02)
- [ ] Documents et stockage R2 avec quotas, alertes, packs, corbeille (DOC-01 à DOC-08)
- [ ] Finances : journal, reçus (CPT-01, CPT-04)
- [ ] BI de base : indicateurs, tableaux de bord, modèle documenté, exports, pseudonymisation (BI-01 à BI-04, BI-08 à BI-10) ; carte de couverture (PIL-02)
- [ ] Console éditeur (SOC-10) ; export et suppression à la demande (SEC-10) ; accès du personnel tracé (SEC-11)
- [ ] Exploitation : sauvegardes et restauration testée, supervision, page de statut, objectifs de performance (NFR-03, NFR-04, NFR-06, NFR-07)
- [ ] Site commercial (maquette « Landing page ») et documentation utilisateur

## P4 : National et Élections (mois 7 à 10)

Jalon : test de charge au volume visé, test d'intrusion sans faille critique ouverte, répétition générale d'une journée de scrutin. À terminer au moins trois mois avant le premier scrutin visé.

- [ ] Marque blanche stores : flavors Flutter, pipeline Codemagic ou Fastlane, publication depuis le compte Apple du parti (SOC-03) ; domaines personnalisés (SOC-04)
- [ ] Réunions, pétitions, vote en assemblée (ENG-04, ENG-05, VOT-08)
- [ ] Gamification avancée : défis, récompenses, points comme critère (GAM-06 à GAM-08)
- [ ] Contributions spéciales (FIN-09) ; budgets et rapport d'origine des dons (CPT-02, CPT-03) ; certificat de formation (FOR-04)
- [ ] BI avancée : entrepôt nocturne, connecteur Power BI et Looker Studio, API de données (BI-05 à BI-07)
- [ ] Module Élections complet : bureaux, mandataires, PV, décompte parallèle, incidents, porte-à-porte, candidats, calendrier (ELE-01 à ELE-18)
- [ ] Infrastructure répliquée, test de charge (NFR-03, NFR-05) ; test d'intrusion (SEC-12)

## P5 : Extensions (après le mois 10)

- [ ] USSD (COM-04), messages vocaux en créole (COM-05)
- [ ] Veille médias (PIL-03), recommandations (PIL-04)

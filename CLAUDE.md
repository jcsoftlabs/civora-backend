# civora

Plateforme SaaS par abonnement pour les partis politiques haïtiens : adhésion, cotisations et dons, organes et postes, rassemblements et gamification, votes internes, formation, communication, documents, finances, BI et module électoral. Dérivée du système NOU (premier client). Nom commercial provisoire.

Auteur et responsable produit : Christopher Jerome.

## Où trouver quoi

| Besoin | Fichier |
| --- | --- |
| Toutes les exigences numérotées (ADH, FIN, VOT…) avec palier et phase | `docs/requirements.md` |
| Ordre de réalisation, phases, jalons, tâches | `docs/roadmap.md` |
| Architecture : multi-tenant, RLS, jobs, webhooks, hors ligne, facturation à l'usage | `docs/architecture.md` |
| Paliers, quotas et activation des modules | `packages/shared/src/plans.ts` |
| Rôles et permissions | `packages/shared/src/permissions.ts` |
| Schéma de données | `packages/db/src/schema/` |
| Politiques RLS | `packages/db/sql/rls.sql` |
| Design : direction, tokens, patterns, écriture | skill `ui-design`, `docs/design/` |
| Règles par application | `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md` |

## Skills de référence (`skills/`)

Le dossier `skills/` est versionné et fait partie du projet. Avant une tâche du type ci-dessous, lire le `SKILL.md` indiqué et l'appliquer. En cas de conflit, `CLAUDE.md` et le skill `ui-design` priment (identité, tokens, écriture). Les skills React ne s'appliquent pas tels quels : la stack est SvelteKit et Flutter.

| Tâche | Skill à lire |
| --- | --- |
| Concevoir un écran ou un composant | `skills/skills-main/skills/frontend-design`, `skills/ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max`, `skills/bencium-marketplace-main/typography/skills/typography` |
| Revoir une interface, accessibilité | `skills/agent-skills-main/skills/web-design-guidelines`, `skills/skills-main-2/plugins/accesslint/skills/accessibility-audit`, `skills/bencium-marketplace-main/design-audit/skills/design-audit` |
| Tests navigateur (Playwright) | `skills/skills-main/skills/webapp-testing` |
| Landing page, campagnes, mobilisation | `skills/bencium-marketplace-main/insurgent-campaign/skills/insurgent-campaign`, `skills/bencium-marketplace-main/bencium-aeo/skills/bencium-aeo` |
| Déploiement Vercel | `skills/agent-skills-main/skills/deploy-to-vercel`, `skills/agent-skills-main/skills/vercel-optimize` |
| Reçus, PV, exports (PDF, Excel, Word) | `skills/skills-main/skills/pdf`, `skills/skills-main/skills/xlsx`, `skills/skills-main/skills/docx` |
| Créer un nouveau skill projet | `skills/skills-main/skills/skill-creator` |

Le cahier des charges de référence est le document « Cahier des charges, SaaS partis politiques ». `docs/requirements.md` en est la version de travail : si les deux divergent, demander à Christopher avant de coder.

## Façon de travailler

1. Toute tâche part d'un ou plusieurs identifiants d'exigence (`ADH-07`, `VOT-02`…). Utiliser la commande `/implementer <ID>`.
2. Vérifier le palier de l'exigence dans `docs/requirements.md` et protéger la fonctionnalité par `requireFeature()` (API) et `hasFeature()` (web, mobile) à partir de `plans.ts`.
3. Toute nouvelle table : `party_id`, politique RLS, test d'isolation entre deux partis. Sans ce test, la tâche n'est pas finie.
4. Tout écran : charger le skill `ui-design` et respecter sa checklist.
5. En fin de tâche : cocher l'exigence dans `docs/requirements.md` (colonne Statut), mettre à jour `docs/roadmap.md`, et lancer `pnpm check:requirements`.
6. Avant une fusion touchant à la sécurité, aux paiements ou aux votes : `/revue-securite`.

## Stack

| Couche | Technologie | Hébergement |
| --- | --- | --- |
| API | Fastify (Node.js 20, TypeScript strict) | Railway au lancement, puis AWS ou Fly.io multi-instances |
| Accès aux données | Drizzle ORM | |
| Tâches de fond | pg-boss (file dans Postgres, pas de Redis) | worker dédié |
| Base | PostgreSQL 16 managé, RLS | réplique en lecture seule pour la BI |
| Web : back-office, console éditeur, sites des partis | SvelteKit | Vercel |
| Mobile | Flutter (reprise de nou_app), application commune multi-partis + marque blanche par flavors | App Store, Google Play |
| Fichiers | Cloudflare R2, préfixe `party/<party_id>/` | |
| E-mails | Resend | |
| Paiements | MonCash, NatCash, KashPaw (HTG), Stripe (devises et abonnements) | |
| Push | Firebase Cloud Messaging | |

Fastify ne va jamais sur Vercel : WebSocket persistants et jobs permanents. Cloudflare Hyperdrive n'est pas utilisé tant que l'API tourne en processus permanent.

## Arborescence

```
apps/
  api/            Fastify : modules métier, webhooks, temps réel
  worker/         processus pg-boss séparé de l'API (jobs planifiés)
  web/            SvelteKit : /admin (parti), /console (éditeur), sites publics par domaine
  mobile/         Flutter
packages/
  db/             schéma Drizzle, migrations, rls.sql, seed, tests d'isolation
  shared/         plans, permissions, schémas de validation partagés
  ui/             composants Svelte construits sur docs/design/tokens.css
docs/             requirements, roadmap, architecture, design
scripts/          outils de contrôle (check-requirements)
.claude/          skills et commandes Claude Code
```

## Règles non négociables

### Multi-tenant et sécurité (SEC-01 à SEC-12, SOC-02)
- Chaque table métier porte `party_id`. Toute requête passe par `withParty(partyId, tx => ...)`, qui ouvre une transaction et fixe `SET LOCAL app.party_id`. Jamais de variable de session, jamais de requête hors transaction.
- L'application se connecte avec le rôle `civora_app`, soumis à RLS. Seules les migrations utilisent `civora_owner`.
- NIN, NIF, passeport, SSN : chiffrés au niveau du champ (enveloppe : clé du parti chiffrée par la clé maîtresse). Jamais en clair dans les logs, exports BI, erreurs.
- Visibilité territoriale : un responsable ne voit que sa zone et ses sous-zones (SOC-05, SEC-05).
- Aucun secret dans le code ni dans la documentation. CORS et WebSocket en liste blanche.
- Vote interne : la table `ballots` ne contient jamais l'identifiant du votant ; la participation est dans `ballot_receipts` (VOT-05, BI-09).
- Toute action sensible écrit dans `audit_log` (append-only).
- Le personnel de la plateforme n'accède aux données d'un parti que par une procédure tracée (SEC-11) ; la console éditeur ne lit que des agrégats.

### Paiements (FIN-01, FIN-02, FIN-12)
- Les fonds vont sur les comptes marchands du parti. La plateforme ne prend aucune commission sur les dons.
- Confirmation par webhook, doublée d'un job de vérification toutes les 5 minutes. Idempotence par clé de transaction.

### Usage et facturation (SOC-08, DOC-04 à DOC-06)
- Le job nocturne `usage.measure` relève membres actifs, Go stockés, SMS, e-mails ; `billing.overage` facture les dépassements (packs de 50 Go à 10 USD, tranches de 1 000 membres).

### Terrain haïtien
- Hors ligne : carte de membre, formations, scan de présence (PRE-04), procès-verbaux (ELE-10). Synchronisation idempotente, horodatage d'origine conservé.
- Langues : français et créole obligatoires, anglais et espagnol ensuite. Aucun texte en dur.
- Cibles tactiles de 44 px, contraste lisible en plein soleil.

## Design (résumé du skill ui-design)
- Jamais de spinner : squelettes animés.
- Jamais de tiret cadratin, dans l'interface comme dans la documentation.
- Jamais de bleu marine. Pas de dégradés décoratifs, pas d'emoji.
- Identité : vert pétrole, ambre, encre, papier ; Bricolage Grotesque et Geist ; objets du militantisme (carte de membre, billet, tampon, bulletin).

## Qualité
- TypeScript strict, ESLint, Prettier. CI bloquante : lint, typecheck, migrations, tests, gitleaks, contrôle des exigences.
- Vitest ; tests d'intégration sur un vrai Postgres pour RLS, paiements et votes ; Playwright pour adhésion, cotisation, vote, scan de présence.
- Migrations relues ; aucune migration destructive sans retour arrière.

## Commandes

```
pnpm install
pnpm dev                 # api + web
pnpm dev:worker          # tâches de fond (pg-boss)
pnpm test
pnpm db:generate         # générer une migration Drizzle
pnpm db:migrate
pnpm db:seed             # deux partis fictifs + NOU de démonstration
pnpm check:requirements  # vérifie la cohérence requirements.md / roadmap.md
```

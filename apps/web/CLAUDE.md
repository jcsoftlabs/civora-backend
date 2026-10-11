# apps/web : SvelteKit sur Vercel

Une seule application sert trois surfaces, choisies par l'hôte dans `src/hooks.server.ts` :

| Hôte | Surface | Contenu |
| --- | --- | --- |
| `<slug>.civora.app/admin` | Back-office du parti | Gestion du parti |
| `<slug>.civora.app` ou domaine du parti | Site public du parti | Pages publiques, pré-adhésion, dons (SOC-03, SOC-04) |
| `console.civora.app` | Console éditeur | Partis clients, usage, santé (SOC-10), agrégats seulement |
| `civora.app` | Site commercial | Landing page, tarifs, démo |

Avant tout écran : charger le skill `ui-design`. Styles uniquement via `docs/design/tokens.css` et les composants de `packages/ui`.

## Écrans du back-office et maquettes de référence

Toile de maquettes : « Maquettes plateforme partis » (artefact Design). Écrans déjà dessinés :

| Écran | Maquette | Exigences |
| --- | --- | --- |
| Liste des membres : double navigation, filtres ET / OU, segments, actions groupées, tableau | « Back-office : liste des membres » | ADH-06, ADH-12, COM-03, FIN-06 |
| Organes : grille, carte sélectionnée inversée, panneau d'édition, mode simple | « Back-office : organes » | ORG-01 à ORG-08 |
| Landing page | « Landing page » | site commercial |

Écrans à concevoir sur le même modèle (voir skill ui-design, section 4) :

| Écran | Exigences |
| --- | --- |
| Fiche membre : onglets, organes, cotisations, présences, points, fil de messages | ADH-02, PRE-07, GAM-09, COM-06 |
| Import guidé avec correspondance des colonnes et doublons | ADH-07 à ADH-09, SOC-09 |
| Formules de cotisation et relevé avec courbe de solde | FIN-03 à FIN-11, CPT-01 |
| Assistant de campagne SMS / WhatsApp en étapes avec aperçu téléphone | COM-03 |
| Événements, QR tournant plein écran, présence en temps réel | PRE-01 à PRE-06 |
| Barème de gamification, badges, classements | GAM-01 à GAM-09 |
| Scrutin : règles du corps électoral, liste figée, résultats, PV | VOT-01 à VOT-10 |
| Rôles et permissions par poste (matrice) | ORG-04, SEC-05 |
| Documents et jauge de stockage | DOC-01 à DOC-08 |
| Tableaux de bord BI | BI-01, BI-02, PIL-01, PIL-02 |
| Carte des membres | PIL-02 |
| Module Élections : bureaux, mandataires, PV, incidents | ELE-01 à ELE-18 |

## Règles

- Rendu serveur pour les sites publics ; le back-office peut être en rendu client après authentification.
- Mises à jour optimistes et squelettes ; jamais de spinner.
- Les fonctionnalités hors palier ne sont pas masquées en silence : afficher l'option verrouillée avec le palier requis (vente additionnelle).
- Tous les textes passent par les fichiers de traduction (fr, ht, en, es).
- Largeur téléphone obligatoire pour les sites publics ; le back-office reste utilisable sur tablette.

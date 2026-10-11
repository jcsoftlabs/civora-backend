---
name: ui-design
description: Identité visuelle, tokens, patterns d'écran et règles d'écriture de civora. À charger avant de créer ou modifier tout écran web (SvelteKit) ou mobile (Flutter), tout composant, toute page publique ou tout e-mail.
---

# Design civora

Le niveau visé est celui des meilleurs outils SaaS, appliqué au terrain politique haïtien. Une interface propre mais générique est un échec : chaque écran doit avoir au moins un détail qui raconte le sujet.

## 1. Direction

**Les objets du militantisme.** Le produit se reconnaît à ses objets, pas à ses cartes rectangulaires :
- la carte de membre (fond pétrole profond, motif de sécurité ondulé, numéro en grand, légère inclinaison, reflet métallisé discret) ;
- le billet de rassemblement (bord perforé, demi-cercles découpés, ligne pointillée) ;
- le tampon « PRÉSENT » ou « VOTÉ » (rouge brique, texture d'encre granuleuse, légère rotation) ;
- le bulletin papier (bord prédécoupé, case cochée par une croix tracée à l'encre bleue) ;
- la pastille ambre (« 2026 cotisation réglée », points gagnés).

Ces objets apparaissent dans l'app mobile, la landing page et les fiches du back-office. Une seule animation forte par écran (le tampon qui s'écrase, la croix qui se trace, le reflet de la carte), le reste reste calme. Toujours respecter `prefers-reduced-motion`.

**Neutralité politique.** Pas de bleu et rouge du drapeau comme couleurs de marque, aucune couleur associée à un parti connu. La plateforme n'appartient à aucun camp.
Cette règle vaut pour l'identité de civora (site commercial, console, valeurs par défaut), **jamais pour les partis** : chaque parti choisit librement sa couleur, y compris rouge, bleu, jaune ou noir. L'assistant de création propose les couleurs fondamentales, un sélecteur libre et la saisie du code exact de la charte du parti ; la lisibilité est garantie par le calcul de contraste (texte blanc ou encre, couleur assombrie seulement si nécessaire).

## 2. Tokens

Source unique : `docs/design/tokens.css`. Ne jamais écrire une couleur en dur dans un composant.

| Rôle | Valeur | Usage |
| --- | --- | --- |
| `--c-primary` | `#0F6E66` vert pétrole | marque, bouton principal (remplacé par la couleur du parti dans son espace) |
| `--c-primary-deep` | `#0B3B37` | carte de membre, sections sombres, rail de navigation (`#12211F`) |
| `--c-accent` | `#E0A33B` / vif `#F2B84B` | gamification, badges, points, mises en avant commerciales |
| `--c-ink` | `#1C1B19` | texte, bouton secondaire plein, carte sélectionnée inversée |
| `--c-ink-2` | `#6B6862` | texte secondaire (jamais plus clair) |
| `--c-paper` | `#F3F0EA` | fond des pages |
| `--c-surface` | `#FFFFFF` | cartes, panneaux, tableaux |
| `--c-line` | `#E4DFD6` | bordures, séparateurs |
| `--c-success` | `#2E8B57` | à jour, payé, validé |
| `--c-warning` | `#C98A12` | échéance proche, quota 80 % |
| `--c-danger` | `#C2412D` | rejeté, en retard, tampon |
| `--c-ink-blue` | `#1E3FA8` | encre du bulletin uniquement |

Interdits : bleu marine, dégradés décoratifs, ombres grises génériques partout, emoji.

**Marque blanche.** La couleur du parti remplace `--c-primary` dans son espace. Le système calcule automatiquement la couleur du texte posé dessus (blanc ou encre) pour un contraste d'au moins 4,5:1, et dérive les teintes claires. Tester chaque composant avec 4 couleurs de parti : pétrole, prune `#7A2E5C`, brique `#B5452B`, bleu moyen `#2F5D9E`.

## 3. Typographie

- **Titres et chiffres** : Bricolage Grotesque (Google Fonts), 700 à 800, interlettrage négatif (-0.02 à -0.045 em), interligne serré (0.95 à 1.1).
- **Texte et interface** : Geist (Google Fonts), 400 à 600.
- Chiffres : `font-variant-numeric: tabular-nums` dans les tableaux, montants, compteurs.
- Échelle : 12, 13, 14, 15, 16, 19, 22, 26, 32, 40, 52, 64, 82 px.
- Pas de libellés en majuscules espacées au-dessus des titres. Pas de police monospace pour les petites données.
- Alternative si l'on veut une voix plus proche de Qomon (qui utilise Centra No 2, police payante) : Figtree ou Outfit en remplacement de Geist, à valider sur maquette.

## 4. Structure du back-office

Référence : les écrans Membres, Organes et Liste des membres de la toile de maquettes.

- **Double navigation** : rail d'icônes sombre (modules) à gauche, puis sous-menu de section (vues, segments enregistrés, import). Le rail porte l'avatar de l'administrateur avec un anneau de présence.
- **En-tête de page** : fil d'Ariane discret, onglets en grand (Bricolage 26 px) avec compteurs, état de synchronisation.
- **Barre d'actions** : recherche en pilule à gauche ; à droite une action secondaire en contour et une action principale pleine. Une seule action principale par vue.
- **Bascule de vue** : Liste, Carte, Calendrier, Tableur, en contrôle segmenté.
- **Constructeur de filtres** : pastilles « champ, opérateur, valeur » reliées par ET / OU, retrait individuel, « Ajouter un filtre », « Enregistrer ce segment ».
- **Actions groupées** : dès qu'une ligne est cochée, une barre sombre apparaît (envoyer un message, ajouter à un organe, relancer, exporter, tout désélectionner).
- **Grilles d'entités** (organes, équipes, campagnes) : nom, type et zone, canaux (WhatsApp, Telegram, lien), responsables cerclés d'ambre, pile d'avatars avec « +N », effectif, statut (Très active, À relancer, Secrète) et prochaine échéance. Chaque carte doit dire quelque chose d'utile, jamais des cartes identiques.
- **Sélection** : la carte sélectionnée s'inverse (fond encre, texte blanc, anneau pétrole).
- **Panneau d'édition latéral** : on modifie sans quitter la liste. Champs avec libellé au-dessus et compteur de caractères ; réglages en interrupteurs avec état écrit (Oui, Non) et une phrase d'explication ; champs conditionnels qui apparaissent quand on active l'option ; bouton « Mode simple » qui masque les réglages avancés ; Annuler et Enregistrer en bas.
- **Tableaux** : avatars en duotone, étiquettes colorées (2 visibles puis « +N »), cotisations de l'année en 12 petits carrés, points en Bricolage, menu « … » par ligne, pagination.
- **Chiffres clés** : bande unique découpée par des filets verticaux, chiffre + mini-courbe + variation. Pas de 4 cartes identiques.
- Écrans à prévoir sur ce modèle : fiche membre complète (onglets, organisations liées, fil de messages et d'appels), assistant de campagne SMS / WhatsApp en étapes avec aperçu téléphone, carte des membres, matrice de rôles et permissions, relevé des cotisations et dons avec courbe de solde, file d'approbations.

## 5. App mobile

- Accueil centré sur la personne : carte de membre, points en grand, barres de présence, prochain rassemblement en billet, rappel de vote.
- Barre de navigation flottante sombre, scan de présence en bouton central surélevé.
- Les trois actions clés (payer, scanner, voter) à un pouce depuis l'accueil.
- Moments de récompense : tampon de présence, points en grand, progression vers le prochain badge, gain de places au classement.
- Pas de fausse barre d'état dans les maquettes.

## 6. Chargement, états vides, erreurs

- **Jamais de spinner.** Squelettes animés (pulsation douce) qui reprennent la forme du contenu attendu.
- Mises à jour optimistes : l'état change tout de suite, la confirmation suit.
- État vide = invitation à agir (« Importez votre fichier de membres »), avec le bouton.
- Erreur = ce qui s'est passé + quoi faire (« Paiement MonCash refusé. Vérifiez votre solde et réessayez »). Jamais de code technique, jamais d'excuse.

## 7. Écriture

- Français clair, vouvoiement, phrases courtes, voix active. Créole soigné au même niveau, relu par un locuteur natif.
- Boutons : verbe d'abord, 1 à 3 mots, sans point (« Créer un organe », « Déposer mon bulletin »). Le même verbe du bouton au message de confirmation.
- Jamais de tiret cadratin. Pas de « avec succès », pas de « veuillez », pas de points d'exclamation dans l'interface.
- Nommer les choses comme un responsable de parti les nomme : section, coordination, cotisation, rassemblement, mandataire, procès-verbal.
- Aucun contenu de remplissage : un chiffre ou un texte manquant devient un repère visible `[À COMPLÉTER]`.

## 8. Accessibilité (plancher, sans exception)

- Vrais éléments : `<button>`, `<a href>`, `<input>` avec `<label>`. Jamais de `div` cliquable.
- Interrupteurs : `role="switch"` + `aria-checked`. Boutons icône : `aria-label`.
- Contraste texte 4,5:1 (3:1 au-delà de 24 px). Couleurs distinguées aussi par la luminosité.
- Focus visible (anneau pétrole 2 px). Cibles tactiles de 44 px minimum.
- Tout fonctionne à la largeur d'un téléphone : menus qui s'empilent, tableaux larges dans une zone défilante.

## 9. Avant de livrer un écran

1. L'écran a-t-il un détail qui raconte le sujet (objet, tampon, carte, billet) sans en abuser ?
2. Une seule action principale ? Un seul moment animé ?
3. Toutes les couleurs viennent des tokens ? Testé avec 4 couleurs de parti ?
4. Squelettes au lieu de spinners, états vides et erreurs écrits ?
5. Contrastes, focus, cibles tactiles, largeur téléphone vérifiés ?
6. Aucun tiret cadratin, aucun bleu marine, aucun emoji ?

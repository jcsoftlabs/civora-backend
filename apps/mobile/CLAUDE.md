# apps/mobile : Flutter

Point de départ : le code de nou_app (34 écrans, mode hors ligne existant). Le projet Flutter est créé ici en P2 (`flutter create`), puis le code de nou_app y est migré écran par écran.

## Une application, plusieurs partis

- **Application commune** (paliers Essentiel et Mouvement) : publiée une seule fois sous le nom de la plateforme. Le membre rejoint son parti par QR code, lien d'invitation ou code ; l'app charge alors le thème (couleur, logo) et les modules actifs du parti. Un membre ne voit jamais les autres partis.
- **Marque blanche** (palier National, SOC-03) : même code, un flavor par parti (`flavors/<slug>.yaml` : nom, icône, couleurs, identifiants, `party_id` fixe). Construction par Codemagic ou Fastlane. Publication depuis le compte développeur Apple **du parti** (règle App Store 4.2.6).

## Écrans prioritaires et maquettes

| Écran | Maquette | Exigences |
| --- | --- | --- |
| Accueil : carte de membre, points, présences, prochain rassemblement en billet, vote en attente | « App membre : accueil » | ADH-11, GAM-05, ENG-03 |
| Présence confirmée : tampon, points, classement | « App membre : présence scannée » | PRE-01 à PRE-04, GAM-01 |
| Bulletin de vote : croix à l'encre, vote secret | « App membre : vote interne » | VOT-05, VOT-09 |
| Paiement de cotisation MonCash, NatCash, carte | à concevoir | FIN-01, FIN-02 |
| Formation et quiz | à concevoir (reprise NOU) | FOR-01 à FOR-03 |
| Mandataire : pointage, saisie du PV, incident | à concevoir | ELE-05, ELE-07, ELE-10, ELE-13 |
| Responsable : scanner la carte d'un membre | à concevoir | PRE-05 |

## Règles

- Hors ligne d'abord pour : carte de membre, formations, scans, PV, porte-à-porte. File d'opérations locale, UUID générés sur le téléphone, horodatage d'origine, synchronisation idempotente (`docs/architecture.md`, section 8).
- Android 8+, 2 Go de mémoire : images compressées, listes paginées, pas d'animation lourde.
- Navigation : barre flottante sombre, scan au centre ; les trois actions clés (payer, scanner, voter) à un pouce de l'accueil.
- Squelettes animés, jamais d'indicateur rotatif. Pas de fausse barre d'état dans les maquettes.
- Langues : français et créole obligatoires.

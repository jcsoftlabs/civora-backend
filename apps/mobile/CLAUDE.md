# apps/mobile : Flutter

Application conçue de zéro, avec sa propre identité (décision du 2026-10-11) : aucun écran ni code n'est repris de nou_app. NOU ne sert qu'à rappeler les contraintes du terrain (hors ligne, Android modeste).

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
| Formation et quiz | à concevoir | FOR-01 à FOR-03 |
| Mandataire : pointage, saisie du PV, incident | à concevoir | ELE-05, ELE-07, ELE-10, ELE-13 |
| Responsable : scanner la carte d'un membre | à concevoir | PRE-05 |

## Règles

- Hors ligne d'abord pour : carte de membre, formations, scans, PV, porte-à-porte. File d'opérations locale, UUID générés sur le téléphone, horodatage d'origine, synchronisation idempotente (`docs/architecture.md`, section 8).
- Android 8+, 2 Go de mémoire : images compressées, listes paginées, pas d'animation lourde.
- Navigation : barre flottante sombre, scan au centre ; les trois actions clés (payer, scanner, voter) à un pouce de l'accueil.
- Squelettes animés, jamais d'indicateur rotatif. Pas de fausse barre d'état dans les maquettes.
- Langues : français et créole obligatoires.

## Commandes

```
flutter run                                   # émulateur Android : l'API locale est vue en 10.0.2.2:4000
flutter run --dart-define=API_URL=https://…    # autre API
flutter test                                  # heure d'Haïti, lecture des codes et liens d'invitation
scripts/screenshots.sh                        # captures fr et ht pour le site commercial (jeu de démonstration)
```

Captures et essais : `--dart-define=DEMO_SESSION=horizon:<jeton>` ouvre la session de la militante de démonstration
(`memberToken` de `.demo-session.json`, écrit par `pnpm db:demo`), en mode développement seulement, sans envoyer
d'e-mail. Polices : Figtree via `google_fonts` (à embarquer dans `assets/` pour le premier lancement hors ligne).

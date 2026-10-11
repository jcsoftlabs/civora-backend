---
name: offline-sync
description: Fonctionnement hors ligne de l'app mobile et synchronisation idempotente (scans de présence, procès-verbaux, porte-à-porte, formations en cache). À charger pour tout travail Flutter touchant aux données ou pour le module sync de l'API.
---

# Hors ligne et synchronisation

## Côté téléphone
- Base locale (Drift ou Isar) ; toute saisie crée une opération dans une file locale avec un UUID généré sur place, le type, les données et l'horodatage d'origine.
- L'interface montre l'état de chaque opération : enregistrée sur le téléphone, envoyée, refusée (avec la raison et l'action possible).
- Envoi automatique au retour du réseau, par lots, avec reprise.
- Cache : carte de membre, formations (médias compris), podcasts, albums, prochains événements.

## Côté API (`modules/sync`)
- Endpoint de lot : chaque opération est appliquée dans `withParty()` ; l'UUID sert de clé dans `sync_operations` : une opération rejouée renvoie le même résultat sans double effet.
- Contrôles à l'application : scan de présence dans la fenêtre de l'événement et jeton de QR valide pour la période ; PV avec contrôles de cohérence (ELE-08).
- Les conflits sont résolus par le serveur ; le téléphone reçoit l'état final.

## Tests
- Rejouer deux fois le même lot ; envoyer des opérations dans le désordre ; simuler une coupure en plein envoi.

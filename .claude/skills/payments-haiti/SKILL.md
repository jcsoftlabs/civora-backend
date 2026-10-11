---
name: payments-haiti
description: Intégration des paiements MonCash, NatCash, KashPaw et Stripe pour les cotisations, dons et abonnements, avec idempotence, réconciliation et reçus. À charger pour tout travail sur le module money, les webhooks ou la facturation plateforme.
---

# Paiements

## Principes
- Deux flux distincts : **argent du parti** (cotisations, dons, contributions) vers les comptes marchands du parti (`merchant_accounts`), et **abonnement à la plateforme** via Stripe Billing vers civora.
- Aucune commission en pourcentage sur les dons (`ADD_ONS.platformCommissionOnDonations = 0`).
- Montants en `numeric(12,2)` avec devise explicite ; jamais de flottant.

## Cycle d'un paiement
1. Création d'une ligne `payments` `pending` avec une `idempotency_key` (membre, échéance ou campagne, montant, tentative).
2. Redirection ou demande au fournisseur avec les identifiants du parti, lus via `credentials_ref` (gestionnaire de secrets).
3. Webhook : vérifier la signature, retrouver le paiement par `provider_ref` ou clé, passer à `succeeded` ou `failed` de façon idempotente.
4. Effets en job : marquer l'échéance payée, écriture comptable, reçu (Resend), points de gamification (cotisation à temps), notification.
5. `payments.reconcile` toutes les 5 minutes interroge le fournisseur pour les paiements restés `pending` (connectivité irrégulière).

## Espèces (FIN-10)
- Saisie par un membre ayant `payments.recordCash` dans la zone ; reçu numéroté ; audit ; visible dans le journal.

## Diaspora (FIN-02, FIN-08)
- Stripe avec compte connecté par parti ; prélèvement automatique possible ; devises USD, EUR, CAD.

## Tests
- Simulateurs de webhooks pour chaque fournisseur ; tests d'idempotence (même webhook reçu deux fois) ; tests de réconciliation.
- Clés de test uniquement ; jamais de vraies clés dans les fixtures.

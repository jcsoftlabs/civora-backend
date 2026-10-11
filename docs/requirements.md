# Exigences

Version de travail du cahier des charges. Chaque ligne est une unité de travail traçable.

- **Palier** : E = Essentiel, M = Mouvement, N = National, Opt = option payante, Él. = module Élections.
- **Phase** : P1 Fondations, P2 Socle SaaS, P3 Lancement, P4 National et Élections, P5 Extensions (voir `roadmap.md`).
- **Origine** : NOU = existe dans NOU, à rendre multi-partis ; Neuf = à développer.
- **Statut** : `à faire`, `en cours`, `fait`. Mettre à jour en fin de tâche.

## SOC : socle SaaS

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| SOC-01 | Création d'un espace parti en libre-service : nom, logo, couleurs, langues, palier | E M N | P2 | Neuf | fait |
| SOC-02 | Isolation des données par parti sur toutes les tables, fichiers et canaux temps réel | E M N | P2 | Neuf | en cours |
| SOC-03 | Marque blanche : thème app et site par parti ; app à son nom dans les stores | E M N (stores : N) | P2, P4 | Neuf | en cours |
| SOC-04 | Domaine personnalisé pour le site public, certificat automatique | N | P4 | Neuf | à faire |
| SOC-05 | Hiérarchie territoriale national, département, commune, section communale ; chaque responsable ne voit que sa zone | E M N (profondeur selon palier) | P2 | NOU | fait |
| SOC-06 | Rôles, organes et postes définis librement par le parti | E M N | P2 | Neuf | fait |
| SOC-07 | Activation des modules selon le palier, sans redéploiement | E M N | P2 | Neuf | fait |
| SOC-08 | Abonnement, factures, relances, suspension après impayé (données gardées 90 jours) ; mesure de la consommation et facturation des dépassements | E M N | P3 | Neuf | à faire |
| SOC-09 | Assistant de démarrage et import du fichier existant | E M N | P3 | Neuf | à faire |
| SOC-10 | Console de l'éditeur : partis clients, consommation, santé du service, sans accès au contenu | interne | P3 | Neuf | à faire |

## ADH : adhésion et fichier des membres

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| ADH-01 | Inscription mobile avec OTP, photo et pièce d'identité (NIN, NIF, passeport, SSN) | E M N | P2 | NOU | en cours |
| ADH-02 | Fiche membre : localisation jusqu'à la section communale, local ou diaspora, pays, personne référente | E M N | P2 | NOU | fait |
| ADH-03 | Niveaux de statut configurables par le parti | E M N | P2 | NOU | fait |
| ADH-04 | Mode d'adhésion au choix et modifiable : libre, sur validation, par parrainage obligatoire | E M N | P2 | Neuf | fait |
| ADH-05 | Parrainage : nombre de parrains, statut minimum du parrain, quota de filleuls, validation par un organe | E M N | P3 | Neuf | à faire |
| ADH-06 | Validation, rejet et notation des adhésions | E M N | P2 | NOU | fait |
| ADH-07 | Import Excel, CSV, Google Sheets : correspondance des colonnes, aperçu, rapport d'erreurs | E M N | P3 | NOU (partiel) | à faire |
| ADH-08 | Détection des doublons à l'import (téléphone, NIN, nom et date de naissance), fusion ou rejet | E M N | P3 | Neuf | à faire |
| ADH-09 | Invitation des membres importés par SMS ou WhatsApp | E M N | P3 | Neuf | à faire |
| ADH-10 | Import de l'historique des cotisations | M N | P3 | Neuf | à faire |
| ADH-11 | Carte de membre numérique avec QR code vérifiable | M N | P3 | NOU (partiel) | en cours |
| ADH-12 | Export filtré (Excel, CSV, PDF), journalisé, limité aux rôles autorisés | E M N | P2 | NOU | fait |

## FIN : cotisations et dons

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| FIN-01 | MonCash, NatCash, KashPaw en HTG, confirmés par webhook et vérification périodique | E M N | P2 | NOU | en cours |
| FIN-02 | Stripe en devises pour la diaspora | M N | P3 | NOU | à faire |
| FIN-03 | Formules de cotisation créées par le parti : nom, montant, devise, périodicité | E (2 formules) M N | P2 | Neuf | fait |
| FIN-04 | Montant différencié par statut, catégorie ou zone | M N | P3 | Neuf | à faire |
| FIN-05 | Échéance fixe ou date anniversaire de l'adhésion | E M N | P2 | Neuf | fait |
| FIN-06 | Délai de grâce, rappels automatiques, statut à jour ou en retard | E M N | P3 | Neuf | à faire |
| FIN-07 | Effets du retard paramétrables (vote, candidature, contenus) | M N | P3 | Neuf | à faire |
| FIN-08 | Paiement d'avance, prélèvement automatique pour la diaspora | M N | P3 | Neuf | à faire |
| FIN-09 | Contributions spéciales demandées à un groupe de membres | N | P4 | Neuf | à faire |
| FIN-10 | Saisie des paiements en espèces par un trésorier local, avec reçu | E M N | P2 | NOU | fait |
| FIN-11 | Campagnes de dons thématiques, ponctuelles ou récurrentes | E M N | P3 | NOU | à faire |
| FIN-12 | Fonds versés sur les comptes marchands du parti, jamais de la plateforme | E M N | P2 | Neuf | fait |

## FOR : formation

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| FOR-01 | Modules séquentiels avec vidéo, audio, documents et quiz | M N | P3 | NOU | en cours |
| FOR-02 | Seuil de réussite et nombre de reprises paramétrables | M N | P3 | NOU | en cours |
| FOR-03 | Formation obligatoire par statut, suivi de complétion par zone | M N | P3 | Neuf | en cours |
| FOR-04 | Certificat de complétion téléchargeable | N | P3 | Neuf | en cours |

## COM : communication

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| COM-01 | Annonces, actualités, podcasts, albums | E M N | P2 | NOU | fait |
| COM-02 | Notifications push ciblées par zone, statut et profil | E M N | P2 | NOU | fait |
| COM-03 | SMS et WhatsApp groupés, facturés sur crédits | E M N | P3 | Neuf | à faire |
| COM-04 | Accès USSD sans smartphone | M N | P5 | Neuf | à faire |
| COM-05 | Messages vocaux en créole | M N | P5 | Neuf | à faire |
| COM-06 | Messagerie interne temps réel et support | M N | P3 | NOU | à faire |

## ENG : engagement et vie démocratique

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| ENG-01 | Parrainage par QR code, suivi des filleuls, points selon le barème | M N | P3 | NOU | à faire |
| ENG-02 | Sondages ciblés, résultats en temps réel | M N | P3 | NOU | à faire |
| ENG-03 | Agenda et événements avec inscription | E M N | P2 | NOU | fait |
| ENG-04 | Réunions : convocation, quorum, présence par QR, procès-verbal | N | P4 | Neuf | à faire |
| ENG-05 | Pétitions et collecte de propositions | N | P4 | Neuf | à faire |

## PRE : présence aux rassemblements

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| PRE-01 | QR code par événement, imprimable ou affiché | E M N | P3 | Neuf | à faire |
| PRE-02 | QR code renouvelé toutes les 30 secondes à l'écran | M N | P3 | Neuf | à faire |
| PRE-03 | Scan valide pendant la plage horaire et, en option, dans un rayon autour du lieu | E M N | P3 | Neuf | à faire |
| PRE-04 | Scan hors ligne puis synchronisé avec l'heure d'origine | E M N | P3 | Neuf | à faire |
| PRE-05 | Mode inverse : un responsable scanne la carte d'un membre sans smartphone | E M N | P3 | Neuf | à faire |
| PRE-06 | Liste de présence en temps réel, export, taux de participation par zone et organe | E M N | P3 | Neuf | à faire |
| PRE-07 | Historique de présence sur la fiche du membre | E M N | P3 | Neuf | à faire |

## GAM : gamification

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| GAM-01 | Barème configurable par action (parrainage, présence, cotisation à temps, formation, vote, sondage) | M N | P3 | NOU (partiel) | à faire |
| GAM-02 | Points différents selon l'événement | M N | P3 | Neuf | à faire |
| GAM-03 | Bonus de régularité, plafonds anti-abus | M N | P3 | Neuf | à faire |
| GAM-04 | Badges et niveaux nommés par le parti | M N | P3 | Neuf | à faire |
| GAM-05 | Classements par période, zone et organe | M N | P3 | Neuf | à faire |
| GAM-06 | Défis temporaires avec date de fin | N | P4 | Neuf | à faire |
| GAM-07 | Récompenses attribuées depuis le back-office | N | P4 | Neuf | à faire |
| GAM-08 | Points utilisables comme critère dans d'autres modules | N | P4 | Neuf | à faire |
| GAM-09 | Journal des points, corrections manuelles tracées | M N | P3 | Neuf | à faire |

## VOT : votes internes

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| VOT-01 | Création d'un scrutin : poste ou question, dates, candidats ou options | E (1 actif) M N | P3 | Neuf | à faire |
| VOT-02 | Corps électoral par règles combinables : zone, organe, statut, ancienneté, cotisation à jour | E M N | P3 | Neuf | à faire |
| VOT-03 | Liste électorale figée, consultable et contestable | M N | P3 | Neuf | à faire |
| VOT-04 | Candidatures en ligne avec conditions d'éligibilité | M N | P3 | Neuf | à faire |
| VOT-05 | Un vote par membre, vote secret | E M N | P3 | Neuf | à faire |
| VOT-06 | Modes : majorité simple, deux tours, liste, oui ou non | M N | P3 | Neuf | à faire |
| VOT-07 | Quorum et seuil de validité | E M N | P3 | Neuf | à faire |
| VOT-08 | Vote sur place en assemblée par QR code | N | P4 | Neuf | à faire |
| VOT-09 | Résultats après clôture, procès-verbal, journal vérifiable | E M N | P3 | Neuf | à faire |
| VOT-10 | Installation automatique du gagnant dans le poste | M N | P3 | Neuf | à faire |

## CPT : finances et conformité

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| CPT-01 | Journal des recettes et dépenses par département | M N | P3 | Neuf | à faire |
| CPT-02 | Budgets de campagne et suivi des écarts | N | P4 | Neuf | à faire |
| CPT-03 | Rapport sur l'origine des dons pour les autorités | N | P4 | Neuf | à faire |
| CPT-04 | Reçus et attestations pour les donateurs | M N | P3 | Neuf | à faire |

## PIL : pilotage

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| PIL-01 | Statistiques d'adhésion, cotisation, engagement par zone | E M N | P2 | NOU | fait |
| PIL-02 | Carte de couverture territoriale | M N | P3 | NOU | à faire |
| PIL-03 | Veille médias et réseaux sociaux | N | P5 | Neuf | à faire |
| PIL-04 | Recommandations (zones faibles, inactifs, meilleurs recruteurs) | N | P5 | Neuf | à faire |

## ORG : organes, postes et hiérarchie

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| ORG-01 | Création libre des organes avec rattachement territorial | E M N | P2 | Neuf | fait |
| ORG-02 | Postes nommés par le parti dans chaque organe | E M N | P2 | Neuf | fait |
| ORG-03 | Profondeur hiérarchique libre dans la limite du palier | E M N | P2 | Neuf | fait |
| ORG-04 | Droits attachés au poste, transmis au successeur | E M N | P2 | Neuf | fait |
| ORG-05 | Mandats datés, historique des titulaires | M N | P3 | Neuf | à faire |
| ORG-06 | Organigramme interne ou public généré | M N | P3 | Neuf | à faire |
| ORG-07 | Pourvoi d'un poste par nomination ou vote interne | M N | P3 | Neuf | à faire |
| ORG-08 | Organe secret, liste des membres masquée, local avec adresse, canaux (WhatsApp, Telegram, lien) | E M N | P3 | Neuf (maquette Organes) | à faire |

## DOC : documents et stockage

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| DOC-01 | Espace documentaire par organe et par zone | E M N | P3 | Neuf | à faire |
| DOC-02 | Droits de lecture et d'écriture par poste et organe | E M N | P3 | Neuf | à faire |
| DOC-03 | Versions et historique | M N | P3 | Neuf | à faire |
| DOC-04 | Mesure du stockage par parti, jauge | E M N | P3 | Neuf | à faire |
| DOC-05 | Alertes à 80 % et 100 % du quota | E M N | P3 | Neuf | à faire |
| DOC-06 | Achat de packs ou blocage des nouveaux envois au-delà du quota | E M N | P3 | Neuf | à faire |
| DOC-07 | Compression automatique, taille maximale par fichier selon palier | E M N | P3 | Neuf | à faire |
| DOC-08 | Corbeille vidée après 30 jours, décomptée du quota | E M N | P3 | Neuf | à faire |

## BI : données et BI

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| BI-01 | Indicateurs prêts à l'emploi | E M N | P3 | Neuf | à faire |
| BI-02 | Tableaux de bord personnalisables | M N | P3 | Neuf | à faire |
| BI-03 | Modèle de données documenté | E M N | P3 | Neuf | à faire |
| BI-04 | Exports planifiés (CSV, Excel, Parquet) | M N | P3 | Neuf | à faire |
| BI-05 | Entrepôt analytique par parti, mis à jour chaque nuit | N | P4 | Neuf | à faire |
| BI-06 | Connexion Power BI, Looker Studio, Metabase, Excel en lecture seule | N, Opt | P4 | Neuf | à faire |
| BI-07 | API de données en lecture seule avec clé par parti | N | P4 | Neuf | à faire |
| BI-08 | Pseudonymisation par défaut des identifiants et téléphones | E M N | P3 | Neuf | à faire |
| BI-09 | Secret du vote préservé dans les données analytiques | E M N | P3 | Neuf | à faire |
| BI-10 | Accès BI par rôle et zone, exports journalisés | E M N | P3 | Neuf | à faire |

## ELE : module Élections (option par cycle)

| ID | Exigence | Palier | Phase | Origine | Statut |
| --- | --- | --- | --- | --- | --- |
| ELE-01 | Centres et bureaux de vote rattachés à la commune et à la section | Él. | P4 | Neuf | à faire |
| ELE-02 | Recrutement des mandataires parmi les membres | Él. | P4 | Neuf | à faire |
| ELE-03 | Formation obligatoire avant affectation | Él. | P4 | Neuf | à faire |
| ELE-04 | Titulaire, suppléant par bureau, superviseur par centre | Él. | P4 | Neuf | à faire |
| ELE-05 | Pointage du jour J géolocalisé et horodaté | Él. | P4 | Neuf | à faire |
| ELE-06 | Tableau de couverture des bureaux | Él. | P4 | Neuf | à faire |
| ELE-07 | Photo du procès-verbal et saisie des chiffres | Él. | P4 | Neuf | à faire |
| ELE-08 | Contrôles de cohérence automatiques | Él. | P4 | Neuf | à faire |
| ELE-09 | Double saisie ou validation superviseur | Él. | P4 | Neuf | à faire |
| ELE-10 | Envoi différé hors réseau, horodatage d'origine | Él. | P4 | Neuf | à faire |
| ELE-11 | Résultats consolidés en temps réel, avec carte | Él. | P4 | Neuf | à faire |
| ELE-12 | Archivage inaltérable des photos et saisies | Él. | P4 | Neuf | à faire |
| ELE-13 | Signalement d'incidents catégorisés avec photo et position | Él. | P4 | Neuf | à faire |
| ELE-14 | Alerte au superviseur et à la cellule juridique | Él. | P4 | Neuf | à faire |
| ELE-15 | Suivi et export des incidents | Él. | P4 | Neuf | à faire |
| ELE-16 | Porte-à-porte : zones, fiches sympathisants, couverture | Él. | P4 | Neuf | à faire |
| ELE-17 | Dossiers des candidats du parti | Él. | P4 | Neuf | à faire |
| ELE-18 | Calendrier électoral avec rappels | Él. | P4 | Neuf | à faire |

## SEC : sécurité et protection des données

| ID | Exigence | Phase | Statut |
| --- | --- | --- | --- |
| SEC-01 | Isolation stricte par parti, prouvée par tests automatisés | P2 | fait |
| SEC-02 | Chiffrement des pièces d'identité au niveau du champ, clé par parti | P2 | fait |
| SEC-03 | TLS en transit, chiffrement au repos | P2 | en cours |
| SEC-04 | Double authentification obligatoire pour les administrateurs | P2 | fait |
| SEC-05 | Contrôle d'accès par rôle et par zone | P2 | fait |
| SEC-06 | Journal d'audit inaltérable | P2 | fait |
| SEC-07 | Aucun secret dans le code, rotation des clés | P1 | en cours |
| SEC-08 | Liste blanche des origines REST et temps réel | P1 | fait |
| SEC-09 | Limitation du débit, protection OTP et connexion | P2 | fait |
| SEC-10 | Export complet et suppression définitive à la demande du parti | P3 | à faire |
| SEC-11 | Accès du personnel aux données d'un parti sur demande écrite, journalisé | P3 | à faire |
| SEC-12 | Test d'intrusion externe avant lancement, puis annuel | P4 | à faire |

## NFR : exigences non fonctionnelles

| ID | Exigence | Phase | Statut |
| --- | --- | --- | --- |
| NFR-01 | Hors ligne : formations, podcasts, albums, fiche membre ; saisies Élections et porte-à-porte synchronisées sans perte ni doublon | P2, P4 | à faire |
| NFR-02 | Android 8 et plus, 2 Go de mémoire | P2 | à faire |
| NFR-03 | Disponibilité 99,5 % par mois, 99,9 % le jour du scrutin | P3, P4 | à faire |
| NFR-04 | API : 95 % des requêtes sous 500 ms | P3 | à faire |
| NFR-05 | Test de charge des remontées de procès-verbaux | P4 | à faire |
| NFR-06 | Sauvegarde quotidienne, 30 jours, restauration testée chaque trimestre | P3 | à faire |
| NFR-07 | Supervision avec alerte et page de statut publique | P3 | à faire |
| NFR-08 | Interfaces en français, créole, anglais, espagnol ; contenus saisissables par langue | P2, P3 | à faire |
| NFR-09 | Lisibilité plein soleil, polices réglables, icônes explicites, squelettes de chargement | P2 | à faire |

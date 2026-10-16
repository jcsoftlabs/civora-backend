// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class LFr extends L {
  LFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'civora';

  @override
  String get welcomeTitle => 'Votre organisation, dans votre poche';

  @override
  String get welcomeLead =>
      'Carte de membre, rassemblements, votes et formations. Rejoignez votre parti, votre association ou votre syndicat.';

  @override
  String get welcomeScan => 'Scanner le QR code';

  @override
  String get welcomeCode => 'J\'ai un code';

  @override
  String get welcomeCodeLabel => 'Code ou adresse de votre organisation';

  @override
  String get welcomeCodeHint => 'horizon';

  @override
  String get welcomeCodeHelp => 'Il figure sur l\'affiche, le lien d\'invitation ou la carte remise par votre section.';

  @override
  String get welcomeContinue => 'Continuer';

  @override
  String get scanTitle => 'Scannez le QR code de votre organisation';

  @override
  String get scanHelp => 'Visez le QR code de l\'affiche ou de l\'invitation.';

  @override
  String get scanDenied => 'L\'appareil photo est refusé. Autorisez-le dans les réglages, ou saisissez le code.';

  @override
  String get joinSignIn => 'Se connecter';

  @override
  String get joinLead => 'Recevez un code à usage unique pour ouvrir votre espace membre.';

  @override
  String get joinEmail => 'Adresse e-mail';

  @override
  String get joinPhone => 'Numéro de téléphone';

  @override
  String get joinByEmail => 'Par e-mail';

  @override
  String get joinBySms => 'Par SMS';

  @override
  String get joinSend => 'Recevoir un code';

  @override
  String get joinOther => 'Changer d\'organisation';

  @override
  String get joinNotMember => 'Pas encore membre ? Adhérez sur le site de l\'organisation, puis revenez ici.';

  @override
  String get otpTitle => 'Entrez le code reçu';

  @override
  String otpLead(String destination) {
    return 'Envoyé à $destination. Il est valable 10 minutes.';
  }

  @override
  String get otpLabel => 'Code à 6 chiffres';

  @override
  String get otpVerify => 'Ouvrir mon espace';

  @override
  String get otpResend => 'Renvoyer un code';

  @override
  String get mfaTitle => 'Double authentification';

  @override
  String get mfaLead =>
      'Votre poste donne des droits de gestion. Entrez le code de votre application d\'authentification.';

  @override
  String get mfaSetupLead =>
      'Votre poste donne des droits de gestion : activez d\'abord la double authentification dans le back-office, puis revenez ici.';

  @override
  String get mfaLabel => 'Code à 6 chiffres';

  @override
  String get mfaVerify => 'Valider';

  @override
  String get navWallet => 'Accueil';

  @override
  String get navSection => 'Section';

  @override
  String get navScan => 'Ma carte';

  @override
  String get navCarnet => 'Carnet';

  @override
  String get navProfile => 'Profil';

  @override
  String hello(String name) {
    return 'Bonjour, $name';
  }

  @override
  String get cardMember => 'Membre';

  @override
  String get cardNumber => 'N°';

  @override
  String cardSince(String year) {
    return 'Depuis $year';
  }

  @override
  String get cardOffline => 'Carte disponible hors ligne';

  @override
  String get cardShow => 'Présentez ce QR code à l\'entrée. Il fonctionne sans connexion.';

  @override
  String get cardPending =>
      'Votre adhésion est en cours de validation. La carte apparaîtra dès qu\'elle sera acceptée.';

  @override
  String duesPaid(String year) {
    return '$year réglée';
  }

  @override
  String get duesDue => 'Cotisation à régler';

  @override
  String duesAmount(String amount) {
    return '$amount à régler';
  }

  @override
  String get ticketLabel => 'Billet';

  @override
  String ticketPlaces(int n) {
    return '$n places restantes';
  }

  @override
  String get ticketRegistered => 'Vous êtes inscrit';

  @override
  String get ballotOpen => 'Vote ouvert';

  @override
  String ballotCloses(String date) {
    return 'Jusqu\'au $date';
  }

  @override
  String ballotOpens(String date) {
    return 'Ouverture le $date';
  }

  @override
  String get ballotVote => 'Déposer mon bulletin';

  @override
  String get ballotVoted => 'Bulletin déposé';

  @override
  String get walletEmpty =>
      'Rien à faire pour l\'instant. Les rassemblements et les votes de votre section apparaîtront ici.';

  @override
  String get sectionTitle => 'Ma section';

  @override
  String get sectionAnnouncement => 'Annonce';

  @override
  String get sectionEditorial => 'À lire';

  @override
  String get sectionEvent => 'Rassemblement';

  @override
  String get sectionTraining => 'Formation';

  @override
  String sectionModules(int done, int total) {
    return '$done modules sur $total';
  }

  @override
  String get sectionEmpty => 'Votre section n\'a rien publié pour l\'instant.';

  @override
  String get carnetTitle => 'Mon carnet';

  @override
  String carnetNumber(String number) {
    return 'Carnet n° $number';
  }

  @override
  String carnetDues(String year) {
    return 'Cotisations $year';
  }

  @override
  String get carnetDuesNone => 'Aucune cotisation prévue cette année.';

  @override
  String get carnetStamps => 'Votes et certificats';

  @override
  String get carnetVoted => 'VOTÉ';

  @override
  String get carnetCertified => 'CERTIFIÉ';

  @override
  String get carnetStampsNone => 'Vos tampons apparaîtront ici : chaque vote, chaque formation réussie.';

  @override
  String carnetStatus(String status) {
    return 'Statut : $status';
  }

  @override
  String get profileTitle => 'Ma fiche';

  @override
  String get profileLanguage => 'Langue';

  @override
  String get profileLogout => 'Se déconnecter';

  @override
  String get profileOrganization => 'Organisation';

  @override
  String get offline => 'Hors ligne : dernières informations enregistrées';

  @override
  String get retry => 'Réessayer';

  @override
  String get errorGeneric => 'Le service ne répond pas. Vérifiez votre connexion et réessayez.';

  @override
  String get errorNotFound => 'Cette organisation est introuvable. Vérifiez le code.';

  @override
  String get errorOtpInvalid => 'Ce code est incorrect ou expiré. Demandez-en un nouveau.';

  @override
  String get errorRateLimited => 'Trop d\'essais. Patientez quelques minutes.';

  @override
  String get errorChannelDisabled => 'Votre organisation n\'envoie pas de code par ce moyen. Choisissez l\'autre.';

  @override
  String get errorInvalidEmail => 'Cette adresse e-mail n\'est pas valide.';

  @override
  String get errorInvalidPhone => 'Indiquez le numéro avec l\'indicatif, par exemple +509 37 00 00 00.';

  @override
  String get errorMfaInvalid => 'Ce code est incorrect. Réessayez avec le code affiché maintenant.';

  @override
  String get yes => 'Oui';

  @override
  String get no => 'Non';

  @override
  String get emailHint => 'nom@exemple.com';

  @override
  String get phoneHint => '+509 37 00 00 00';

  @override
  String get navNews => 'Actus';

  @override
  String get navAct => 'Agir';

  @override
  String get navMe => 'Moi';

  @override
  String get todoTitle => 'À faire';

  @override
  String get todoNone =>
      'Rien ne vous attend pour l\'instant. Les votes, cotisations et rassemblements apparaîtront ici.';

  @override
  String todoVote(String title) {
    return 'Voter : $title';
  }

  @override
  String todoDues(String amount) {
    return 'Cotisation : $amount';
  }

  @override
  String todoEvent(String title, String when) {
    return '$title, $when';
  }

  @override
  String cardYear(String year) {
    return 'Membre $year';
  }

  @override
  String get newsTitle => 'Actualités';

  @override
  String get newsAll => 'Tout';

  @override
  String get newsAnnouncements => 'Annonces';

  @override
  String get newsArticles => 'Articles';

  @override
  String get newsPodcasts => 'Podcasts';

  @override
  String get newsAlbums => 'Albums';

  @override
  String get newsNews => 'Actualité';

  @override
  String get newsPodcast => 'Podcast';

  @override
  String get newsAlbum => 'Album';

  @override
  String newsPhotos(int n) {
    return '$n photos';
  }

  @override
  String get newsEmpty => 'Rien de publié ici pour l\'instant.';

  @override
  String get newsNoAudio => 'Le fichier audio de cet épisode n\'est pas encore disponible.';

  @override
  String get play => 'Écouter';

  @override
  String get pause => 'Pause';

  @override
  String get actTitle => 'Agir';

  @override
  String get actVotes => 'Votes';

  @override
  String get actTraining => 'Formations';

  @override
  String get actEvents => 'Rassemblements';

  @override
  String get actDues => 'Cotisations';

  @override
  String get actPodcasts => 'Podcasts';

  @override
  String get actAlbums => 'Albums';

  @override
  String actVotesOpen(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n votes ouverts',
      one: '1 vote ouvert',
      zero: 'Aucun vote ouvert',
    );
    return '$_temp0';
  }

  @override
  String actTrainingState(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n formations',
      one: '1 formation',
      zero: 'Aucune formation',
    );
    return '$_temp0';
  }

  @override
  String actEventsState(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n à venir',
      one: '1 à venir',
      zero: 'Aucun à venir',
    );
    return '$_temp0';
  }

  @override
  String get actDuesUpToDate => 'À jour';

  @override
  String get actDuesLate => 'À régler';

  @override
  String get actListen => 'Écouter';

  @override
  String get actSee => 'Voir';

  @override
  String get votesTitle => 'Votes internes';

  @override
  String get votesEmpty => 'Aucun scrutin ne vous concerne pour l\'instant.';

  @override
  String get votePhasePreparation => 'Liste figée';

  @override
  String get votePhaseOpen => 'Vote ouvert';

  @override
  String get votePhaseCounting => 'Dépouillement en cours';

  @override
  String get votePhaseClosed => 'Dépouillé';

  @override
  String get votePhasePublished => 'Résultats certifiés';

  @override
  String get voteChooseOne => 'Cochez une case.';

  @override
  String voteChooseUpTo(int n) {
    return 'Cochez jusqu\'à $n noms.';
  }

  @override
  String get voteBlank => 'Voter blanc';

  @override
  String get voteSecret => 'Votre vote est secret : votre bulletin ne porte pas votre nom.';

  @override
  String get voteSubmit => 'Déposer mon bulletin';

  @override
  String get voteConfirmTitle => 'Déposer ce bulletin ?';

  @override
  String get voteConfirmLead => 'Une fois déposé, il ne peut plus être modifié.';

  @override
  String get voteConfirm => 'Déposer';

  @override
  String get cancel => 'Annuler';

  @override
  String get voteDone => 'Bulletin déposé';

  @override
  String get voteReceipt => 'Votre code de reçu';

  @override
  String get voteReceiptLead =>
      'Notez-le : il n\'est enregistré nulle part. Après le dépouillement, il vous permet de vérifier que votre bulletin a été compté, sans révéler votre choix.';

  @override
  String get voteCopy => 'Copier le code';

  @override
  String get voteCopied => 'Code copié';

  @override
  String get voteAlready => 'Vous avez déjà voté à ce tour.';

  @override
  String voteOpensAt(String date) {
    return 'Le vote ouvre le $date.';
  }

  @override
  String get voteNotOpen => 'Le vote n\'est pas ouvert.';

  @override
  String get voteResults => 'Résultats';

  @override
  String voteVotes(int n) {
    return '$n voix';
  }

  @override
  String get voteElected => 'Élu';

  @override
  String get voteAdopted => 'Proposition adoptée';

  @override
  String get voteRejected => 'Proposition rejetée';

  @override
  String voteTurnout(String p) {
    return 'Participation : $p %';
  }

  @override
  String get voteVerify => 'Vérifier mon bulletin';

  @override
  String get voteVerifyLabel => 'Code de reçu';

  @override
  String get voteVerifyOk => 'Votre bulletin figure dans le journal : il a été compté.';

  @override
  String get voteVerifyMissing => 'Ce code ne figure pas dans le journal. Vérifiez la saisie.';

  @override
  String get voteRound2 => 'Second tour';

  @override
  String get coursesTitle => 'Formations';

  @override
  String get coursesEmpty => 'Aucune formation pour l\'instant.';

  @override
  String get courseMandatory => 'Obligatoire';

  @override
  String get courseDone => 'Terminée';

  @override
  String courseModule(int n) {
    return 'Module $n';
  }

  @override
  String get courseLocked => 'Réussissez le module précédent pour l\'ouvrir.';

  @override
  String get courseQuiz => 'Passer le quiz';

  @override
  String get coursePassed => 'Module réussi';

  @override
  String get courseOpenVideo => 'Regarder la vidéo';

  @override
  String get courseOpenFile => 'Ouvrir le document';

  @override
  String get courseViewed => 'Lu';

  @override
  String get quizTitle => 'Quiz';

  @override
  String get quizSubmit => 'Valider mes réponses';

  @override
  String quizScore(int s) {
    return 'Score : $s %';
  }

  @override
  String get quizPassed => 'Réussi. Le module suivant est ouvert.';

  @override
  String get quizFailed => 'Pas encore. Revoyez les questions signalées et réessayez.';

  @override
  String quizAttemptsLeft(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n essais restants',
      one: '1 essai restant',
      zero: 'Plus d\'essai',
    );
    return '$_temp0';
  }

  @override
  String quizCertificate(String n) {
    return 'Certificat n° $n';
  }

  @override
  String get quizWrong => 'À revoir';

  @override
  String get eventsTitle => 'Rassemblements';

  @override
  String get eventsEmpty => 'Aucun rassemblement à venir.';

  @override
  String get eventRegister => 'M\'inscrire';

  @override
  String get eventUnregister => 'Me désinscrire';

  @override
  String get eventFull => 'Complet';

  @override
  String get duesTitle => 'Cotisations';

  @override
  String get duesNone => 'Aucune cotisation prévue.';

  @override
  String get duesStatePaid => 'Réglée';

  @override
  String get duesStateDue => 'À régler';

  @override
  String get duesStateLate => 'En retard';

  @override
  String get duesStateUpcoming => 'À venir';

  @override
  String get duesPayHint =>
      'Réglez auprès de votre trésorier de section ; le paiement MonCash et NatCash arrive dans l\'application.';

  @override
  String get meTitle => 'Moi';

  @override
  String get podcastDownload => 'Télécharger pour l\'écouter hors ligne';

  @override
  String get podcastDownloaded => 'Disponible hors ligne';

  @override
  String get podcastDownloading => 'Téléchargement…';

  @override
  String get welcomeSignInLead =>
      'Entrez l\'adresse e-mail que connaît votre organisation : vous recevrez un code à 6 chiffres, et l\'app vous ouvre votre espace.';

  @override
  String get welcomeUsePhone => 'Utiliser mon numéro de téléphone';

  @override
  String get welcomeUseEmail => 'Utiliser mon adresse e-mail';

  @override
  String get welcomeJoinOrg => 'Pas encore membre ? Rejoindre une organisation';

  @override
  String otpLeadAny(String destination) {
    return 'Si $destination est connue d\'une organisation, un code vient d\'y être envoyé. Il est valable 10 minutes.';
  }

  @override
  String helloTitle(String name) {
    return 'Bonjour, $name.';
  }

  @override
  String waiting(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n choses vous attendent.',
      one: 'Une chose vous attend.',
      zero: 'Tout est à jour.',
    );
    return '$_temp0';
  }

  @override
  String newsLead(String org) {
    return 'Le fil de $org.';
  }

  @override
  String kindDate(String kind, String date) {
    return '$kind, $date';
  }

  @override
  String meStatus(String status, String number) {
    return '$status, membre n° $number';
  }

  @override
  String meNumber(String number) {
    return 'Membre n° $number';
  }

  @override
  String get statPoints => 'points';

  @override
  String get statReferrals => 'filleuls';

  @override
  String get statVotes => 'votes';

  @override
  String get actReferral => 'Parrainer';

  @override
  String get referralTitle => 'Votre code de parrainage';

  @override
  String get referralLead => 'Partagez-le : la personne qui adhère avec ce code devient votre filleul.';

  @override
  String get referralShare => 'Partager';

  @override
  String get referralCopy => 'Copier';

  @override
  String get referralCopied => 'Code copié';

  @override
  String referralShareText(String org, String code, String url) {
    return 'Rejoins $org avec mon code de parrainage $code : $url';
  }

  @override
  String get referralsTitle => 'Mes filleuls';

  @override
  String get referralNone => 'Vos filleuls apparaîtront ici dès leur adhésion.';

  @override
  String get referralPending => 'En attente';

  @override
  String get referralValidated => 'Validé';

  @override
  String get referralRejected => 'Refusé';

  @override
  String get pointsTitle => 'Mes points';

  @override
  String get pointsAll => 'Tout voir';

  @override
  String get pointsNone => 'Vos points apparaîtront ici : parrainage, formation, vote, cotisation réglée à temps.';

  @override
  String get pointsReferral => 'Filleul validé';

  @override
  String get pointsTraining => 'Formation réussie';

  @override
  String get pointsVote => 'Vote déposé';

  @override
  String get pointsDues => 'Cotisation réglée à temps';

  @override
  String get pointsAttendance => 'Présence à un rassemblement';

  @override
  String get pointsManual => 'Correction';

  @override
  String get photoChange => 'Changer ma photo';

  @override
  String get photoCamera => 'Prendre une photo';

  @override
  String get photoGallery => 'Choisir dans la galerie';

  @override
  String get photoError => 'La photo n\'a pas pu être envoyée. Vérifiez votre connexion et réessayez.';

  @override
  String joinAdhere(String org) {
    return 'Adhérer à $org';
  }

  @override
  String get adhesionLead => 'Remplissez votre fiche. Vous recevrez un code par e-mail pour confirmer votre adresse.';

  @override
  String get firstName => 'Prénom';

  @override
  String get lastName => 'Nom';

  @override
  String get zoneLabel => 'Section communale ou ville de la diaspora';

  @override
  String get zoneHelp => 'Tapez au moins deux lettres, puis choisissez dans la liste.';

  @override
  String get zoneNone => 'Aucune zone trouvée.';

  @override
  String get sponsorLabel => 'Code de parrainage';

  @override
  String get sponsorOptional => 'Code de parrainage, si un membre vous l\'a donné';

  @override
  String get sponsorRequired => 'Votre organisation adhère par parrainage : le code d\'un membre est demandé.';

  @override
  String get adhesionSubmit => 'Recevoir mon code';

  @override
  String get errorSponsorNotFound => 'Ce code de parrainage n\'existe pas. Vérifiez-le auprès de votre parrain.';

  @override
  String get errorSponsorRequired => 'Le code d\'un parrain est demandé pour adhérer.';

  @override
  String get errorAlreadyMember => 'Cette adresse a déjà une adhésion. Connectez-vous avec elle.';

  @override
  String get errorZoneTooBroad => 'Choisissez une section communale ou une ville de la diaspora.';

  @override
  String get errorRequired => 'Ce champ est obligatoire.';

  @override
  String newsByline(String date, String author) {
    return '$date, par $author';
  }

  @override
  String get newsReadMore => 'Lire la suite';

  @override
  String get newsArticle => 'Article';

  @override
  String get adhesionMore => 'Compléter ma fiche maintenant';

  @override
  String get adhesionMoreHelp => 'Facultatif : vous pourrez le faire plus tard depuis votre fiche.';

  @override
  String get phoneLabel => 'Téléphone ou WhatsApp';

  @override
  String get phoneHelp => 'Avec l\'indicatif du pays, par exemple +509 3712 3456.';

  @override
  String get birthDateLabel => 'Date de naissance';

  @override
  String get birthDateNone => 'Non renseignée';

  @override
  String get birthDatePick => 'Choisir';

  @override
  String get referentLabel => 'Personne référente';

  @override
  String get referentHelp => 'Numéro de membre d\'une personne du parti qui vous connaît.';

  @override
  String get referentNone => 'Aucune';

  @override
  String get referentRemove => 'Retirer';

  @override
  String get identityLabel => 'Pièce d\'identité';

  @override
  String get identityKindNin => 'NIN, carte d\'identification nationale';

  @override
  String get identityKindNif => 'NIF';

  @override
  String get identityKindPassport => 'Passeport';

  @override
  String get identityKindSsn => 'SSN, États-Unis';

  @override
  String get identityNumber => 'Numéro de la pièce';

  @override
  String get identityNote =>
      'Le numéro est chiffré dès l\'envoi. Personne ne le lit sans une autorisation tracée, et l\'application ne l\'affiche jamais.';

  @override
  String get identityAdd => 'Ajouter une pièce';

  @override
  String get identityNone => 'Aucune pièce enregistrée.';

  @override
  String get identitySaved => 'Pièce enregistrée et chiffrée';

  @override
  String get errorPhone => 'Saisissez le numéro avec l\'indicatif, par exemple +509 3712 3456.';

  @override
  String get errorIdentityValue => 'Saisissez le numéro complet de la pièce.';

  @override
  String get errorIdentityDuplicate =>
      'Ce numéro de pièce est déjà enregistré dans le parti. Contactez le responsable de votre section.';

  @override
  String get errorIdentityExists => 'Vous avez déjà enregistré une pièce de ce type.';

  @override
  String get errorReferentNotFound => 'Aucun membre validé ne porte ce numéro.';

  @override
  String get profileOpen => 'Voir et modifier ma fiche';

  @override
  String get profileSave => 'Enregistrer';

  @override
  String get profileSaved => 'Fiche enregistrée';

  @override
  String get profileEmailHelp =>
      'Elle sert à vous connecter. Pour la changer, contactez le responsable de votre section.';

  @override
  String get profileLocation => 'Lieu';

  @override
  String get profileZoneChange => 'Changer de lieu';

  @override
  String get profileOfflineEdit => 'Hors ligne : votre fiche s\'affiche, mais il faut le réseau pour la modifier.';

  @override
  String memberSince(String date) {
    return 'Membre depuis le $date';
  }

  @override
  String get certificateDownload => 'Télécharger mon certificat';

  @override
  String get certificateError => 'Le certificat n\'a pas pu être téléchargé. Vérifiez votre connexion et réessayez.';
}

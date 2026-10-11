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
  String get welcomeCodeHelp =>
      'Il figure sur l\'affiche, le lien d\'invitation ou la carte remise par votre section.';

  @override
  String get welcomeContinue => 'Continuer';

  @override
  String get scanTitle => 'Scannez le QR code de votre organisation';

  @override
  String get scanHelp => 'Visez le QR code de l\'affiche ou de l\'invitation.';

  @override
  String get scanDenied =>
      'L\'appareil photo est refusé. Autorisez-le dans les réglages, ou saisissez le code.';

  @override
  String get joinSignIn => 'Se connecter';

  @override
  String get joinLead =>
      'Recevez un code à usage unique pour ouvrir votre espace membre.';

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
  String get joinNotMember =>
      'Pas encore membre ? Adhérez sur le site de l\'organisation, puis revenez ici.';

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
    return 'Bonjou, $name';
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
  String get cardShow =>
      'Présentez ce QR code à l\'entrée. Il fonctionne sans connexion.';

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
  String get carnetStampsNone =>
      'Vos tampons apparaîtront ici : chaque vote, chaque formation réussie.';

  @override
  String carnetStatus(String status) {
    return 'Statut : $status';
  }

  @override
  String get profileTitle => 'Profil';

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
  String get errorGeneric =>
      'Le service ne répond pas. Vérifiez votre connexion et réessayez.';

  @override
  String get errorNotFound =>
      'Cette organisation est introuvable. Vérifiez le code.';

  @override
  String get errorOtpInvalid =>
      'Ce code est incorrect ou expiré. Demandez-en un nouveau.';

  @override
  String get errorRateLimited => 'Trop d\'essais. Patientez quelques minutes.';

  @override
  String get errorChannelDisabled =>
      'Votre organisation n\'envoie pas de code par ce moyen. Choisissez l\'autre.';

  @override
  String get errorInvalidEmail => 'Cette adresse e-mail n\'est pas valide.';

  @override
  String get errorInvalidPhone =>
      'Indiquez le numéro avec l\'indicatif, par exemple +509 37 00 00 00.';

  @override
  String get errorMfaInvalid =>
      'Ce code est incorrect. Réessayez avec le code affiché maintenant.';

  @override
  String get yes => 'Oui';

  @override
  String get no => 'Non';

  @override
  String get emailHint => 'nom@exemple.com';

  @override
  String get phoneHint => '+509 37 00 00 00';
}

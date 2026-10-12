import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_fr.dart';
import 'app_localizations_ht.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of L
/// returned by `L.of(context)`.
///
/// Applications need to include `L.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: L.localizationsDelegates,
///   supportedLocales: L.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the L.supportedLocales
/// property.
abstract class L {
  L(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static L of(BuildContext context) {
    return Localizations.of<L>(context, L)!;
  }

  static const LocalizationsDelegate<L> delegate = _LDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('fr'), Locale('ht')];

  /// No description provided for @appName.
  ///
  /// In fr, this message translates to:
  /// **'civora'**
  String get appName;

  /// No description provided for @welcomeTitle.
  ///
  /// In fr, this message translates to:
  /// **'Votre organisation, dans votre poche'**
  String get welcomeTitle;

  /// No description provided for @welcomeLead.
  ///
  /// In fr, this message translates to:
  /// **'Carte de membre, rassemblements, votes et formations. Rejoignez votre parti, votre association ou votre syndicat.'**
  String get welcomeLead;

  /// No description provided for @welcomeScan.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le QR code'**
  String get welcomeScan;

  /// No description provided for @welcomeCode.
  ///
  /// In fr, this message translates to:
  /// **'J\'ai un code'**
  String get welcomeCode;

  /// No description provided for @welcomeCodeLabel.
  ///
  /// In fr, this message translates to:
  /// **'Code ou adresse de votre organisation'**
  String get welcomeCodeLabel;

  /// No description provided for @welcomeCodeHint.
  ///
  /// In fr, this message translates to:
  /// **'horizon'**
  String get welcomeCodeHint;

  /// No description provided for @welcomeCodeHelp.
  ///
  /// In fr, this message translates to:
  /// **'Il figure sur l\'affiche, le lien d\'invitation ou la carte remise par votre section.'**
  String get welcomeCodeHelp;

  /// No description provided for @welcomeContinue.
  ///
  /// In fr, this message translates to:
  /// **'Continuer'**
  String get welcomeContinue;

  /// No description provided for @scanTitle.
  ///
  /// In fr, this message translates to:
  /// **'Scannez le QR code de votre organisation'**
  String get scanTitle;

  /// No description provided for @scanHelp.
  ///
  /// In fr, this message translates to:
  /// **'Visez le QR code de l\'affiche ou de l\'invitation.'**
  String get scanHelp;

  /// No description provided for @scanDenied.
  ///
  /// In fr, this message translates to:
  /// **'L\'appareil photo est refusé. Autorisez-le dans les réglages, ou saisissez le code.'**
  String get scanDenied;

  /// No description provided for @joinSignIn.
  ///
  /// In fr, this message translates to:
  /// **'Se connecter'**
  String get joinSignIn;

  /// No description provided for @joinLead.
  ///
  /// In fr, this message translates to:
  /// **'Recevez un code à usage unique pour ouvrir votre espace membre.'**
  String get joinLead;

  /// No description provided for @joinEmail.
  ///
  /// In fr, this message translates to:
  /// **'Adresse e-mail'**
  String get joinEmail;

  /// No description provided for @joinPhone.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de téléphone'**
  String get joinPhone;

  /// No description provided for @joinByEmail.
  ///
  /// In fr, this message translates to:
  /// **'Par e-mail'**
  String get joinByEmail;

  /// No description provided for @joinBySms.
  ///
  /// In fr, this message translates to:
  /// **'Par SMS'**
  String get joinBySms;

  /// No description provided for @joinSend.
  ///
  /// In fr, this message translates to:
  /// **'Recevoir un code'**
  String get joinSend;

  /// No description provided for @joinOther.
  ///
  /// In fr, this message translates to:
  /// **'Changer d\'organisation'**
  String get joinOther;

  /// No description provided for @joinNotMember.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore membre ? Adhérez sur le site de l\'organisation, puis revenez ici.'**
  String get joinNotMember;

  /// No description provided for @otpTitle.
  ///
  /// In fr, this message translates to:
  /// **'Entrez le code reçu'**
  String get otpTitle;

  /// No description provided for @otpLead.
  ///
  /// In fr, this message translates to:
  /// **'Envoyé à {destination}. Il est valable 10 minutes.'**
  String otpLead(String destination);

  /// No description provided for @otpLabel.
  ///
  /// In fr, this message translates to:
  /// **'Code à 6 chiffres'**
  String get otpLabel;

  /// No description provided for @otpVerify.
  ///
  /// In fr, this message translates to:
  /// **'Ouvrir mon espace'**
  String get otpVerify;

  /// No description provided for @otpResend.
  ///
  /// In fr, this message translates to:
  /// **'Renvoyer un code'**
  String get otpResend;

  /// No description provided for @mfaTitle.
  ///
  /// In fr, this message translates to:
  /// **'Double authentification'**
  String get mfaTitle;

  /// No description provided for @mfaLead.
  ///
  /// In fr, this message translates to:
  /// **'Votre poste donne des droits de gestion. Entrez le code de votre application d\'authentification.'**
  String get mfaLead;

  /// No description provided for @mfaSetupLead.
  ///
  /// In fr, this message translates to:
  /// **'Votre poste donne des droits de gestion : activez d\'abord la double authentification dans le back-office, puis revenez ici.'**
  String get mfaSetupLead;

  /// No description provided for @mfaLabel.
  ///
  /// In fr, this message translates to:
  /// **'Code à 6 chiffres'**
  String get mfaLabel;

  /// No description provided for @mfaVerify.
  ///
  /// In fr, this message translates to:
  /// **'Valider'**
  String get mfaVerify;

  /// No description provided for @navWallet.
  ///
  /// In fr, this message translates to:
  /// **'Accueil'**
  String get navWallet;

  /// No description provided for @navSection.
  ///
  /// In fr, this message translates to:
  /// **'Section'**
  String get navSection;

  /// No description provided for @navScan.
  ///
  /// In fr, this message translates to:
  /// **'Ma carte'**
  String get navScan;

  /// No description provided for @navCarnet.
  ///
  /// In fr, this message translates to:
  /// **'Carnet'**
  String get navCarnet;

  /// No description provided for @navProfile.
  ///
  /// In fr, this message translates to:
  /// **'Profil'**
  String get navProfile;

  /// No description provided for @hello.
  ///
  /// In fr, this message translates to:
  /// **'Bonjou, {name}'**
  String hello(String name);

  /// No description provided for @cardMember.
  ///
  /// In fr, this message translates to:
  /// **'Membre'**
  String get cardMember;

  /// No description provided for @cardNumber.
  ///
  /// In fr, this message translates to:
  /// **'N°'**
  String get cardNumber;

  /// No description provided for @cardSince.
  ///
  /// In fr, this message translates to:
  /// **'Depuis {year}'**
  String cardSince(String year);

  /// No description provided for @cardOffline.
  ///
  /// In fr, this message translates to:
  /// **'Carte disponible hors ligne'**
  String get cardOffline;

  /// No description provided for @cardShow.
  ///
  /// In fr, this message translates to:
  /// **'Présentez ce QR code à l\'entrée. Il fonctionne sans connexion.'**
  String get cardShow;

  /// No description provided for @cardPending.
  ///
  /// In fr, this message translates to:
  /// **'Votre adhésion est en cours de validation. La carte apparaîtra dès qu\'elle sera acceptée.'**
  String get cardPending;

  /// No description provided for @duesPaid.
  ///
  /// In fr, this message translates to:
  /// **'{year} réglée'**
  String duesPaid(String year);

  /// No description provided for @duesDue.
  ///
  /// In fr, this message translates to:
  /// **'Cotisation à régler'**
  String get duesDue;

  /// No description provided for @duesAmount.
  ///
  /// In fr, this message translates to:
  /// **'{amount} à régler'**
  String duesAmount(String amount);

  /// No description provided for @ticketLabel.
  ///
  /// In fr, this message translates to:
  /// **'Billet'**
  String get ticketLabel;

  /// No description provided for @ticketPlaces.
  ///
  /// In fr, this message translates to:
  /// **'{n} places restantes'**
  String ticketPlaces(int n);

  /// No description provided for @ticketRegistered.
  ///
  /// In fr, this message translates to:
  /// **'Vous êtes inscrit'**
  String get ticketRegistered;

  /// No description provided for @ballotOpen.
  ///
  /// In fr, this message translates to:
  /// **'Vote ouvert'**
  String get ballotOpen;

  /// No description provided for @ballotCloses.
  ///
  /// In fr, this message translates to:
  /// **'Jusqu\'au {date}'**
  String ballotCloses(String date);

  /// No description provided for @ballotOpens.
  ///
  /// In fr, this message translates to:
  /// **'Ouverture le {date}'**
  String ballotOpens(String date);

  /// No description provided for @ballotVote.
  ///
  /// In fr, this message translates to:
  /// **'Déposer mon bulletin'**
  String get ballotVote;

  /// No description provided for @ballotVoted.
  ///
  /// In fr, this message translates to:
  /// **'Bulletin déposé'**
  String get ballotVoted;

  /// No description provided for @walletEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Rien à faire pour l\'instant. Les rassemblements et les votes de votre section apparaîtront ici.'**
  String get walletEmpty;

  /// No description provided for @sectionTitle.
  ///
  /// In fr, this message translates to:
  /// **'Ma section'**
  String get sectionTitle;

  /// No description provided for @sectionAnnouncement.
  ///
  /// In fr, this message translates to:
  /// **'Annonce'**
  String get sectionAnnouncement;

  /// No description provided for @sectionEditorial.
  ///
  /// In fr, this message translates to:
  /// **'À lire'**
  String get sectionEditorial;

  /// No description provided for @sectionEvent.
  ///
  /// In fr, this message translates to:
  /// **'Rassemblement'**
  String get sectionEvent;

  /// No description provided for @sectionTraining.
  ///
  /// In fr, this message translates to:
  /// **'Formation'**
  String get sectionTraining;

  /// No description provided for @sectionModules.
  ///
  /// In fr, this message translates to:
  /// **'{done} modules sur {total}'**
  String sectionModules(int done, int total);

  /// No description provided for @sectionEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Votre section n\'a rien publié pour l\'instant.'**
  String get sectionEmpty;

  /// No description provided for @carnetTitle.
  ///
  /// In fr, this message translates to:
  /// **'Mon carnet'**
  String get carnetTitle;

  /// No description provided for @carnetNumber.
  ///
  /// In fr, this message translates to:
  /// **'Carnet n° {number}'**
  String carnetNumber(String number);

  /// No description provided for @carnetDues.
  ///
  /// In fr, this message translates to:
  /// **'Cotisations {year}'**
  String carnetDues(String year);

  /// No description provided for @carnetDuesNone.
  ///
  /// In fr, this message translates to:
  /// **'Aucune cotisation prévue cette année.'**
  String get carnetDuesNone;

  /// No description provided for @carnetStamps.
  ///
  /// In fr, this message translates to:
  /// **'Votes et certificats'**
  String get carnetStamps;

  /// No description provided for @carnetVoted.
  ///
  /// In fr, this message translates to:
  /// **'VOTÉ'**
  String get carnetVoted;

  /// No description provided for @carnetCertified.
  ///
  /// In fr, this message translates to:
  /// **'CERTIFIÉ'**
  String get carnetCertified;

  /// No description provided for @carnetStampsNone.
  ///
  /// In fr, this message translates to:
  /// **'Vos tampons apparaîtront ici : chaque vote, chaque formation réussie.'**
  String get carnetStampsNone;

  /// No description provided for @carnetStatus.
  ///
  /// In fr, this message translates to:
  /// **'Statut : {status}'**
  String carnetStatus(String status);

  /// No description provided for @profileTitle.
  ///
  /// In fr, this message translates to:
  /// **'Profil'**
  String get profileTitle;

  /// No description provided for @profileLanguage.
  ///
  /// In fr, this message translates to:
  /// **'Langue'**
  String get profileLanguage;

  /// No description provided for @profileLogout.
  ///
  /// In fr, this message translates to:
  /// **'Se déconnecter'**
  String get profileLogout;

  /// No description provided for @profileOrganization.
  ///
  /// In fr, this message translates to:
  /// **'Organisation'**
  String get profileOrganization;

  /// No description provided for @offline.
  ///
  /// In fr, this message translates to:
  /// **'Hors ligne : dernières informations enregistrées'**
  String get offline;

  /// No description provided for @retry.
  ///
  /// In fr, this message translates to:
  /// **'Réessayer'**
  String get retry;

  /// No description provided for @errorGeneric.
  ///
  /// In fr, this message translates to:
  /// **'Le service ne répond pas. Vérifiez votre connexion et réessayez.'**
  String get errorGeneric;

  /// No description provided for @errorNotFound.
  ///
  /// In fr, this message translates to:
  /// **'Cette organisation est introuvable. Vérifiez le code.'**
  String get errorNotFound;

  /// No description provided for @errorOtpInvalid.
  ///
  /// In fr, this message translates to:
  /// **'Ce code est incorrect ou expiré. Demandez-en un nouveau.'**
  String get errorOtpInvalid;

  /// No description provided for @errorRateLimited.
  ///
  /// In fr, this message translates to:
  /// **'Trop d\'essais. Patientez quelques minutes.'**
  String get errorRateLimited;

  /// No description provided for @errorChannelDisabled.
  ///
  /// In fr, this message translates to:
  /// **'Votre organisation n\'envoie pas de code par ce moyen. Choisissez l\'autre.'**
  String get errorChannelDisabled;

  /// No description provided for @errorInvalidEmail.
  ///
  /// In fr, this message translates to:
  /// **'Cette adresse e-mail n\'est pas valide.'**
  String get errorInvalidEmail;

  /// No description provided for @errorInvalidPhone.
  ///
  /// In fr, this message translates to:
  /// **'Indiquez le numéro avec l\'indicatif, par exemple +509 37 00 00 00.'**
  String get errorInvalidPhone;

  /// No description provided for @errorMfaInvalid.
  ///
  /// In fr, this message translates to:
  /// **'Ce code est incorrect. Réessayez avec le code affiché maintenant.'**
  String get errorMfaInvalid;

  /// No description provided for @yes.
  ///
  /// In fr, this message translates to:
  /// **'Oui'**
  String get yes;

  /// No description provided for @no.
  ///
  /// In fr, this message translates to:
  /// **'Non'**
  String get no;

  /// No description provided for @emailHint.
  ///
  /// In fr, this message translates to:
  /// **'nom@exemple.com'**
  String get emailHint;

  /// No description provided for @phoneHint.
  ///
  /// In fr, this message translates to:
  /// **'+509 37 00 00 00'**
  String get phoneHint;

  /// No description provided for @navNews.
  ///
  /// In fr, this message translates to:
  /// **'Actus'**
  String get navNews;

  /// No description provided for @navAct.
  ///
  /// In fr, this message translates to:
  /// **'Agir'**
  String get navAct;

  /// No description provided for @navMe.
  ///
  /// In fr, this message translates to:
  /// **'Moi'**
  String get navMe;

  /// No description provided for @todoTitle.
  ///
  /// In fr, this message translates to:
  /// **'À faire'**
  String get todoTitle;

  /// No description provided for @todoNone.
  ///
  /// In fr, this message translates to:
  /// **'Rien ne vous attend pour l\'instant. Les votes, cotisations et rassemblements apparaîtront ici.'**
  String get todoNone;

  /// No description provided for @todoVote.
  ///
  /// In fr, this message translates to:
  /// **'Voter : {title}'**
  String todoVote(String title);

  /// No description provided for @todoDues.
  ///
  /// In fr, this message translates to:
  /// **'Cotisation : {amount}'**
  String todoDues(String amount);

  /// No description provided for @todoEvent.
  ///
  /// In fr, this message translates to:
  /// **'{title}, {when}'**
  String todoEvent(String title, String when);

  /// No description provided for @cardYear.
  ///
  /// In fr, this message translates to:
  /// **'Membre {year}'**
  String cardYear(String year);

  /// No description provided for @newsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Actualités'**
  String get newsTitle;

  /// No description provided for @newsAll.
  ///
  /// In fr, this message translates to:
  /// **'Tout'**
  String get newsAll;

  /// No description provided for @newsAnnouncements.
  ///
  /// In fr, this message translates to:
  /// **'Annonces'**
  String get newsAnnouncements;

  /// No description provided for @newsArticles.
  ///
  /// In fr, this message translates to:
  /// **'Articles'**
  String get newsArticles;

  /// No description provided for @newsPodcasts.
  ///
  /// In fr, this message translates to:
  /// **'Podcasts'**
  String get newsPodcasts;

  /// No description provided for @newsAlbums.
  ///
  /// In fr, this message translates to:
  /// **'Albums'**
  String get newsAlbums;

  /// No description provided for @newsNews.
  ///
  /// In fr, this message translates to:
  /// **'Actualité'**
  String get newsNews;

  /// No description provided for @newsPodcast.
  ///
  /// In fr, this message translates to:
  /// **'Podcast'**
  String get newsPodcast;

  /// No description provided for @newsAlbum.
  ///
  /// In fr, this message translates to:
  /// **'Album'**
  String get newsAlbum;

  /// No description provided for @newsPhotos.
  ///
  /// In fr, this message translates to:
  /// **'{n} photos'**
  String newsPhotos(int n);

  /// No description provided for @newsEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Rien de publié ici pour l\'instant.'**
  String get newsEmpty;

  /// No description provided for @newsNoAudio.
  ///
  /// In fr, this message translates to:
  /// **'Le fichier audio de cet épisode n\'est pas encore disponible.'**
  String get newsNoAudio;

  /// No description provided for @play.
  ///
  /// In fr, this message translates to:
  /// **'Écouter'**
  String get play;

  /// No description provided for @pause.
  ///
  /// In fr, this message translates to:
  /// **'Pause'**
  String get pause;

  /// No description provided for @actTitle.
  ///
  /// In fr, this message translates to:
  /// **'Agir'**
  String get actTitle;

  /// No description provided for @actVotes.
  ///
  /// In fr, this message translates to:
  /// **'Votes'**
  String get actVotes;

  /// No description provided for @actTraining.
  ///
  /// In fr, this message translates to:
  /// **'Formations'**
  String get actTraining;

  /// No description provided for @actEvents.
  ///
  /// In fr, this message translates to:
  /// **'Rassemblements'**
  String get actEvents;

  /// No description provided for @actDues.
  ///
  /// In fr, this message translates to:
  /// **'Cotisations'**
  String get actDues;

  /// No description provided for @actPodcasts.
  ///
  /// In fr, this message translates to:
  /// **'Podcasts'**
  String get actPodcasts;

  /// No description provided for @actAlbums.
  ///
  /// In fr, this message translates to:
  /// **'Albums'**
  String get actAlbums;

  /// No description provided for @actVotesOpen.
  ///
  /// In fr, this message translates to:
  /// **'{n, plural, =0{Aucun vote ouvert} =1{1 vote ouvert} other{{n} votes ouverts}}'**
  String actVotesOpen(int n);

  /// No description provided for @actTrainingState.
  ///
  /// In fr, this message translates to:
  /// **'{n, plural, =0{Aucune formation} =1{1 formation} other{{n} formations}}'**
  String actTrainingState(int n);

  /// No description provided for @actEventsState.
  ///
  /// In fr, this message translates to:
  /// **'{n, plural, =0{Aucun à venir} =1{1 à venir} other{{n} à venir}}'**
  String actEventsState(int n);

  /// No description provided for @actDuesUpToDate.
  ///
  /// In fr, this message translates to:
  /// **'À jour'**
  String get actDuesUpToDate;

  /// No description provided for @actDuesLate.
  ///
  /// In fr, this message translates to:
  /// **'À régler'**
  String get actDuesLate;

  /// No description provided for @actListen.
  ///
  /// In fr, this message translates to:
  /// **'Écouter'**
  String get actListen;

  /// No description provided for @actSee.
  ///
  /// In fr, this message translates to:
  /// **'Voir'**
  String get actSee;

  /// No description provided for @votesTitle.
  ///
  /// In fr, this message translates to:
  /// **'Votes internes'**
  String get votesTitle;

  /// No description provided for @votesEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucun scrutin ne vous concerne pour l\'instant.'**
  String get votesEmpty;

  /// No description provided for @votePhasePreparation.
  ///
  /// In fr, this message translates to:
  /// **'Liste figée'**
  String get votePhasePreparation;

  /// No description provided for @votePhaseOpen.
  ///
  /// In fr, this message translates to:
  /// **'Vote ouvert'**
  String get votePhaseOpen;

  /// No description provided for @votePhaseCounting.
  ///
  /// In fr, this message translates to:
  /// **'Dépouillement en cours'**
  String get votePhaseCounting;

  /// No description provided for @votePhaseClosed.
  ///
  /// In fr, this message translates to:
  /// **'Dépouillé'**
  String get votePhaseClosed;

  /// No description provided for @votePhasePublished.
  ///
  /// In fr, this message translates to:
  /// **'Résultats certifiés'**
  String get votePhasePublished;

  /// No description provided for @voteChooseOne.
  ///
  /// In fr, this message translates to:
  /// **'Cochez une case.'**
  String get voteChooseOne;

  /// No description provided for @voteChooseUpTo.
  ///
  /// In fr, this message translates to:
  /// **'Cochez jusqu\'à {n} noms.'**
  String voteChooseUpTo(int n);

  /// No description provided for @voteBlank.
  ///
  /// In fr, this message translates to:
  /// **'Voter blanc'**
  String get voteBlank;

  /// No description provided for @voteSecret.
  ///
  /// In fr, this message translates to:
  /// **'Votre vote est secret : votre bulletin ne porte pas votre nom.'**
  String get voteSecret;

  /// No description provided for @voteSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Déposer mon bulletin'**
  String get voteSubmit;

  /// No description provided for @voteConfirmTitle.
  ///
  /// In fr, this message translates to:
  /// **'Déposer ce bulletin ?'**
  String get voteConfirmTitle;

  /// No description provided for @voteConfirmLead.
  ///
  /// In fr, this message translates to:
  /// **'Une fois déposé, il ne peut plus être modifié.'**
  String get voteConfirmLead;

  /// No description provided for @voteConfirm.
  ///
  /// In fr, this message translates to:
  /// **'Déposer'**
  String get voteConfirm;

  /// No description provided for @cancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler'**
  String get cancel;

  /// No description provided for @voteDone.
  ///
  /// In fr, this message translates to:
  /// **'Bulletin déposé'**
  String get voteDone;

  /// No description provided for @voteReceipt.
  ///
  /// In fr, this message translates to:
  /// **'Votre code de reçu'**
  String get voteReceipt;

  /// No description provided for @voteReceiptLead.
  ///
  /// In fr, this message translates to:
  /// **'Notez-le : il n\'est enregistré nulle part. Après le dépouillement, il vous permet de vérifier que votre bulletin a été compté, sans révéler votre choix.'**
  String get voteReceiptLead;

  /// No description provided for @voteCopy.
  ///
  /// In fr, this message translates to:
  /// **'Copier le code'**
  String get voteCopy;

  /// No description provided for @voteCopied.
  ///
  /// In fr, this message translates to:
  /// **'Code copié'**
  String get voteCopied;

  /// No description provided for @voteAlready.
  ///
  /// In fr, this message translates to:
  /// **'Vous avez déjà voté à ce tour.'**
  String get voteAlready;

  /// No description provided for @voteOpensAt.
  ///
  /// In fr, this message translates to:
  /// **'Le vote ouvre le {date}.'**
  String voteOpensAt(String date);

  /// No description provided for @voteNotOpen.
  ///
  /// In fr, this message translates to:
  /// **'Le vote n\'est pas ouvert.'**
  String get voteNotOpen;

  /// No description provided for @voteResults.
  ///
  /// In fr, this message translates to:
  /// **'Résultats'**
  String get voteResults;

  /// No description provided for @voteVotes.
  ///
  /// In fr, this message translates to:
  /// **'{n} voix'**
  String voteVotes(int n);

  /// No description provided for @voteElected.
  ///
  /// In fr, this message translates to:
  /// **'Élu'**
  String get voteElected;

  /// No description provided for @voteAdopted.
  ///
  /// In fr, this message translates to:
  /// **'Proposition adoptée'**
  String get voteAdopted;

  /// No description provided for @voteRejected.
  ///
  /// In fr, this message translates to:
  /// **'Proposition rejetée'**
  String get voteRejected;

  /// No description provided for @voteTurnout.
  ///
  /// In fr, this message translates to:
  /// **'Participation : {p} %'**
  String voteTurnout(String p);

  /// No description provided for @voteVerify.
  ///
  /// In fr, this message translates to:
  /// **'Vérifier mon bulletin'**
  String get voteVerify;

  /// No description provided for @voteVerifyLabel.
  ///
  /// In fr, this message translates to:
  /// **'Code de reçu'**
  String get voteVerifyLabel;

  /// No description provided for @voteVerifyOk.
  ///
  /// In fr, this message translates to:
  /// **'Votre bulletin figure dans le journal : il a été compté.'**
  String get voteVerifyOk;

  /// No description provided for @voteVerifyMissing.
  ///
  /// In fr, this message translates to:
  /// **'Ce code ne figure pas dans le journal. Vérifiez la saisie.'**
  String get voteVerifyMissing;

  /// No description provided for @voteRound2.
  ///
  /// In fr, this message translates to:
  /// **'Second tour'**
  String get voteRound2;

  /// No description provided for @coursesTitle.
  ///
  /// In fr, this message translates to:
  /// **'Formations'**
  String get coursesTitle;

  /// No description provided for @coursesEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucune formation pour l\'instant.'**
  String get coursesEmpty;

  /// No description provided for @courseMandatory.
  ///
  /// In fr, this message translates to:
  /// **'Obligatoire'**
  String get courseMandatory;

  /// No description provided for @courseDone.
  ///
  /// In fr, this message translates to:
  /// **'Terminée'**
  String get courseDone;

  /// No description provided for @courseModule.
  ///
  /// In fr, this message translates to:
  /// **'Module {n}'**
  String courseModule(int n);

  /// No description provided for @courseLocked.
  ///
  /// In fr, this message translates to:
  /// **'Réussissez le module précédent pour l\'ouvrir.'**
  String get courseLocked;

  /// No description provided for @courseQuiz.
  ///
  /// In fr, this message translates to:
  /// **'Passer le quiz'**
  String get courseQuiz;

  /// No description provided for @coursePassed.
  ///
  /// In fr, this message translates to:
  /// **'Module réussi'**
  String get coursePassed;

  /// No description provided for @courseOpenVideo.
  ///
  /// In fr, this message translates to:
  /// **'Regarder la vidéo'**
  String get courseOpenVideo;

  /// No description provided for @courseOpenFile.
  ///
  /// In fr, this message translates to:
  /// **'Ouvrir le document'**
  String get courseOpenFile;

  /// No description provided for @courseViewed.
  ///
  /// In fr, this message translates to:
  /// **'Lu'**
  String get courseViewed;

  /// No description provided for @quizTitle.
  ///
  /// In fr, this message translates to:
  /// **'Quiz'**
  String get quizTitle;

  /// No description provided for @quizSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Valider mes réponses'**
  String get quizSubmit;

  /// No description provided for @quizScore.
  ///
  /// In fr, this message translates to:
  /// **'Score : {s} %'**
  String quizScore(int s);

  /// No description provided for @quizPassed.
  ///
  /// In fr, this message translates to:
  /// **'Réussi. Le module suivant est ouvert.'**
  String get quizPassed;

  /// No description provided for @quizFailed.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore. Revoyez les questions signalées et réessayez.'**
  String get quizFailed;

  /// No description provided for @quizAttemptsLeft.
  ///
  /// In fr, this message translates to:
  /// **'{n, plural, =0{Plus d\'essai} =1{1 essai restant} other{{n} essais restants}}'**
  String quizAttemptsLeft(int n);

  /// No description provided for @quizCertificate.
  ///
  /// In fr, this message translates to:
  /// **'Certificat n° {n}'**
  String quizCertificate(String n);

  /// No description provided for @quizWrong.
  ///
  /// In fr, this message translates to:
  /// **'À revoir'**
  String get quizWrong;

  /// No description provided for @eventsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Rassemblements'**
  String get eventsTitle;

  /// No description provided for @eventsEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucun rassemblement à venir.'**
  String get eventsEmpty;

  /// No description provided for @eventRegister.
  ///
  /// In fr, this message translates to:
  /// **'M\'inscrire'**
  String get eventRegister;

  /// No description provided for @eventUnregister.
  ///
  /// In fr, this message translates to:
  /// **'Me désinscrire'**
  String get eventUnregister;

  /// No description provided for @eventFull.
  ///
  /// In fr, this message translates to:
  /// **'Complet'**
  String get eventFull;

  /// No description provided for @duesTitle.
  ///
  /// In fr, this message translates to:
  /// **'Cotisations'**
  String get duesTitle;

  /// No description provided for @duesNone.
  ///
  /// In fr, this message translates to:
  /// **'Aucune cotisation prévue.'**
  String get duesNone;

  /// No description provided for @duesStatePaid.
  ///
  /// In fr, this message translates to:
  /// **'Réglée'**
  String get duesStatePaid;

  /// No description provided for @duesStateDue.
  ///
  /// In fr, this message translates to:
  /// **'À régler'**
  String get duesStateDue;

  /// No description provided for @duesStateLate.
  ///
  /// In fr, this message translates to:
  /// **'En retard'**
  String get duesStateLate;

  /// No description provided for @duesStateUpcoming.
  ///
  /// In fr, this message translates to:
  /// **'À venir'**
  String get duesStateUpcoming;

  /// No description provided for @duesPayHint.
  ///
  /// In fr, this message translates to:
  /// **'Réglez auprès de votre trésorier de section ; le paiement MonCash et NatCash arrive dans l\'application.'**
  String get duesPayHint;

  /// No description provided for @meTitle.
  ///
  /// In fr, this message translates to:
  /// **'Moi'**
  String get meTitle;

  /// No description provided for @podcastDownload.
  ///
  /// In fr, this message translates to:
  /// **'Télécharger pour l\'écouter hors ligne'**
  String get podcastDownload;

  /// No description provided for @podcastDownloaded.
  ///
  /// In fr, this message translates to:
  /// **'Disponible hors ligne'**
  String get podcastDownloaded;

  /// No description provided for @podcastDownloading.
  ///
  /// In fr, this message translates to:
  /// **'Téléchargement…'**
  String get podcastDownloading;

  /// No description provided for @welcomeSignInLead.
  ///
  /// In fr, this message translates to:
  /// **'Entrez l\'adresse e-mail que connaît votre organisation : vous recevrez un code à 6 chiffres, et l\'app vous ouvre votre espace.'**
  String get welcomeSignInLead;

  /// No description provided for @welcomeUsePhone.
  ///
  /// In fr, this message translates to:
  /// **'Utiliser mon numéro de téléphone'**
  String get welcomeUsePhone;

  /// No description provided for @welcomeUseEmail.
  ///
  /// In fr, this message translates to:
  /// **'Utiliser mon adresse e-mail'**
  String get welcomeUseEmail;

  /// No description provided for @welcomeJoinOrg.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore membre ? Rejoindre une organisation'**
  String get welcomeJoinOrg;

  /// No description provided for @otpLeadAny.
  ///
  /// In fr, this message translates to:
  /// **'Si {destination} est connue d\'une organisation, un code vient d\'y être envoyé. Il est valable 10 minutes.'**
  String otpLeadAny(String destination);
}

class _LDelegate extends LocalizationsDelegate<L> {
  const _LDelegate();

  @override
  Future<L> load(Locale locale) {
    return SynchronousFuture<L>(lookupL(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['fr', 'ht'].contains(locale.languageCode);

  @override
  bool shouldReload(_LDelegate old) => false;
}

L lookupL(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'fr':
      return LFr();
    case 'ht':
      return LHt();
  }

  throw FlutterError(
    'L.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

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
  L(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

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
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('fr'),
    Locale('ht'),
  ];

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
}

class _LDelegate extends LocalizationsDelegate<L> {
  const _LDelegate();

  @override
  Future<L> load(Locale locale) {
    return SynchronousFuture<L>(lookupL(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['fr', 'ht'].contains(locale.languageCode);

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

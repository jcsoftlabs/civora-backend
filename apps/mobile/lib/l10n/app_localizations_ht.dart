// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Haitian Haitian Creole (`ht`).
class LHt extends L {
  LHt([String locale = 'ht']) : super(locale);

  @override
  String get appName => 'civora';

  @override
  String get welcomeTitle => 'Òganizasyon w, nan pòch ou';

  @override
  String get welcomeLead =>
      'Kat manm, rasanbleman, vòt ak fòmasyon. Rantre nan pati w, asosyasyon w oswa sendika w.';

  @override
  String get welcomeScan => 'Eskane kòd QR la';

  @override
  String get welcomeCode => 'Mwen gen yon kòd';

  @override
  String get welcomeCodeLabel => 'Kòd oswa adrès òganizasyon w';

  @override
  String get welcomeCodeHint => 'horizon';

  @override
  String get welcomeCodeHelp =>
      'Li sou afich la, lyen envitasyon an oswa kat seksyon w ba ou a.';

  @override
  String get welcomeContinue => 'Kontinye';

  @override
  String get scanTitle => 'Eskane kòd QR òganizasyon w';

  @override
  String get scanHelp => 'Vize kòd QR ki sou afich la oswa envitasyon an.';

  @override
  String get scanDenied =>
      'Kamera a refize. Otorize l nan paramèt yo, oswa tape kòd la.';

  @override
  String get joinSignIn => 'Konekte';

  @override
  String get joinLead =>
      'Resevwa yon kòd pou yon sèl fwa pou ouvri espas manm ou.';

  @override
  String get joinEmail => 'Adrès imèl';

  @override
  String get joinPhone => 'Nimewo telefòn';

  @override
  String get joinByEmail => 'Pa imèl';

  @override
  String get joinBySms => 'Pa SMS';

  @override
  String get joinSend => 'Resevwa yon kòd';

  @override
  String get joinOther => 'Chanje òganizasyon';

  @override
  String get joinNotMember =>
      'Ou poko manm ? Fè adezyon sou sit òganizasyon an, epi tounen la a.';

  @override
  String get otpTitle => 'Tape kòd ou resevwa a';

  @override
  String otpLead(String destination) {
    return 'Nou voye l bay $destination. Li bon pou 10 minit.';
  }

  @override
  String get otpLabel => 'Kòd 6 chif';

  @override
  String get otpVerify => 'Ouvri espas mwen';

  @override
  String get otpResend => 'Voye yon lòt kòd';

  @override
  String get mfaTitle => 'Doub otantifikasyon';

  @override
  String get mfaLead =>
      'Pòs ou ba ou dwa pou jere. Tape kòd aplikasyon otantifikasyon w lan.';

  @override
  String get mfaSetupLead =>
      'Pòs ou ba ou dwa pou jere : aktive doub otantifikasyon an nan back-office la anvan, epi tounen la a.';

  @override
  String get mfaLabel => 'Kòd 6 chif';

  @override
  String get mfaVerify => 'Valide';

  @override
  String get navWallet => 'Akèy';

  @override
  String get navSection => 'Seksyon';

  @override
  String get navScan => 'Kat mwen';

  @override
  String get navCarnet => 'Kanè';

  @override
  String get navProfile => 'Pwofil';

  @override
  String hello(String name) {
    return 'Bonjou, $name';
  }

  @override
  String get cardMember => 'Manm';

  @override
  String get cardNumber => 'Nimewo';

  @override
  String cardSince(String year) {
    return 'Depi $year';
  }

  @override
  String get cardOffline => 'Kat la disponib san entènèt';

  @override
  String get cardShow =>
      'Montre kòd QR sa a nan antre a. Li mache san koneksyon.';

  @override
  String get cardPending =>
      'Y ap valide adezyon w. Kat la ap parèt depi yo aksepte l.';

  @override
  String duesPaid(String year) {
    return '$year peye';
  }

  @override
  String get duesDue => 'Kotizasyon pou peye';

  @override
  String duesAmount(String amount) {
    return '$amount pou peye';
  }

  @override
  String get ticketLabel => 'Tikè';

  @override
  String ticketPlaces(int n) {
    return '$n plas ki rete';
  }

  @override
  String get ticketRegistered => 'Ou enskri';

  @override
  String get ballotOpen => 'Vòt ouvè';

  @override
  String ballotCloses(String date) {
    return 'Jiska $date';
  }

  @override
  String ballotOpens(String date) {
    return 'Ouvèti $date';
  }

  @override
  String get ballotVote => 'Depoze bilten mwen';

  @override
  String get ballotVoted => 'Bilten depoze';

  @override
  String get walletEmpty =>
      'Pa gen anyen pou fè kounye a. Rasanbleman ak vòt seksyon w ap parèt la a.';

  @override
  String get sectionTitle => 'Seksyon mwen';

  @override
  String get sectionAnnouncement => 'Anons';

  @override
  String get sectionEditorial => 'Pou li';

  @override
  String get sectionEvent => 'Rasanbleman';

  @override
  String get sectionTraining => 'Fòmasyon';

  @override
  String sectionModules(int done, int total) {
    return '$done modil sou $total';
  }

  @override
  String get sectionEmpty => 'Seksyon w poko pibliye anyen.';

  @override
  String get carnetTitle => 'Kanè mwen';

  @override
  String carnetNumber(String number) {
    return 'Kanè nimewo $number';
  }

  @override
  String carnetDues(String year) {
    return 'Kotizasyon $year';
  }

  @override
  String get carnetDuesNone => 'Pa gen kotizasyon pou ane sa a.';

  @override
  String get carnetStamps => 'Vòt ak sètifika';

  @override
  String get carnetVoted => 'VOTE';

  @override
  String get carnetCertified => 'SÈTIFYE';

  @override
  String get carnetStampsNone =>
      'Tanpon w yo ap parèt la a : chak vòt, chak fòmasyon ou reyisi.';

  @override
  String carnetStatus(String status) {
    return 'Estati : $status';
  }

  @override
  String get profileTitle => 'Pwofil';

  @override
  String get profileLanguage => 'Lang';

  @override
  String get profileLogout => 'Dekonekte';

  @override
  String get profileOrganization => 'Òganizasyon';

  @override
  String get offline => 'San entènèt : dènye enfòmasyon ki anrejistre';

  @override
  String get retry => 'Eseye ankò';

  @override
  String get errorGeneric =>
      'Sèvis la pa reponn. Verifye koneksyon w epi eseye ankò.';

  @override
  String get errorNotFound => 'Nou pa jwenn òganizasyon sa a. Verifye kòd la.';

  @override
  String get errorOtpInvalid =>
      'Kòd sa a pa bon oswa li ekspire. Mande yon lòt.';

  @override
  String get errorRateLimited => 'Twòp esè. Tann kèk minit.';

  @override
  String get errorChannelDisabled =>
      'Òganizasyon w pa voye kòd pa mwayen sa a. Chwazi lòt la.';

  @override
  String get errorInvalidEmail => 'Adrès imèl sa a pa valab.';

  @override
  String get errorInvalidPhone =>
      'Mete nimewo a ak endikatif la, tankou +509 37 00 00 00.';

  @override
  String get errorMfaInvalid =>
      'Kòd sa a pa bon. Eseye ak kòd ki parèt kounye a.';

  @override
  String get yes => 'Wi';

  @override
  String get no => 'Non';

  @override
  String get emailHint => 'non@egzanp.com';

  @override
  String get phoneHint => '+509 37 00 00 00';
}

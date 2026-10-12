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
  String get welcomeLead => 'Kat manm, rasanbleman, vòt ak fòmasyon. Rantre nan pati w, asosyasyon w oswa sendika w.';

  @override
  String get welcomeScan => 'Eskane kòd QR la';

  @override
  String get welcomeCode => 'Mwen gen yon kòd';

  @override
  String get welcomeCodeLabel => 'Kòd oswa adrès òganizasyon w';

  @override
  String get welcomeCodeHint => 'horizon';

  @override
  String get welcomeCodeHelp => 'Li sou afich la, lyen envitasyon an oswa kat seksyon w ba ou a.';

  @override
  String get welcomeContinue => 'Kontinye';

  @override
  String get scanTitle => 'Eskane kòd QR òganizasyon w';

  @override
  String get scanHelp => 'Vize kòd QR ki sou afich la oswa envitasyon an.';

  @override
  String get scanDenied => 'Kamera a refize. Otorize l nan paramèt yo, oswa tape kòd la.';

  @override
  String get joinSignIn => 'Konekte';

  @override
  String get joinLead => 'Resevwa yon kòd pou yon sèl fwa pou ouvri espas manm ou.';

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
  String get joinNotMember => 'Ou poko manm ? Fè adezyon sou sit òganizasyon an, epi tounen la a.';

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
  String get mfaLead => 'Pòs ou ba ou dwa pou jere. Tape kòd aplikasyon otantifikasyon w lan.';

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
  String get cardShow => 'Montre kòd QR sa a nan antre a. Li mache san koneksyon.';

  @override
  String get cardPending => 'Y ap valide adezyon w. Kat la ap parèt depi yo aksepte l.';

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
  String get walletEmpty => 'Pa gen anyen pou fè kounye a. Rasanbleman ak vòt seksyon w ap parèt la a.';

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
  String get carnetStampsNone => 'Tanpon w yo ap parèt la a : chak vòt, chak fòmasyon ou reyisi.';

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
  String get errorGeneric => 'Sèvis la pa reponn. Verifye koneksyon w epi eseye ankò.';

  @override
  String get errorNotFound => 'Nou pa jwenn òganizasyon sa a. Verifye kòd la.';

  @override
  String get errorOtpInvalid => 'Kòd sa a pa bon oswa li ekspire. Mande yon lòt.';

  @override
  String get errorRateLimited => 'Twòp esè. Tann kèk minit.';

  @override
  String get errorChannelDisabled => 'Òganizasyon w pa voye kòd pa mwayen sa a. Chwazi lòt la.';

  @override
  String get errorInvalidEmail => 'Adrès imèl sa a pa valab.';

  @override
  String get errorInvalidPhone => 'Mete nimewo a ak endikatif la, tankou +509 37 00 00 00.';

  @override
  String get errorMfaInvalid => 'Kòd sa a pa bon. Eseye ak kòd ki parèt kounye a.';

  @override
  String get yes => 'Wi';

  @override
  String get no => 'Non';

  @override
  String get emailHint => 'non@egzanp.com';

  @override
  String get phoneHint => '+509 37 00 00 00';

  @override
  String get navNews => 'Nouvèl';

  @override
  String get navAct => 'Aji';

  @override
  String get navMe => 'Mwen';

  @override
  String get todoTitle => 'Pou fè';

  @override
  String get todoNone => 'Pa gen anyen k ap tann ou kounye a. Vòt, kotizasyon ak rasanbleman ap parèt la a.';

  @override
  String todoVote(String title) {
    return 'Vote : $title';
  }

  @override
  String todoDues(String amount) {
    return 'Kotizasyon : $amount';
  }

  @override
  String todoEvent(String title, String when) {
    return '$title, $when';
  }

  @override
  String cardYear(String year) {
    return 'Manm $year';
  }

  @override
  String get newsTitle => 'Nouvèl';

  @override
  String get newsAll => 'Tout';

  @override
  String get newsAnnouncements => 'Anons';

  @override
  String get newsArticles => 'Atik';

  @override
  String get newsPodcasts => 'Podkast';

  @override
  String get newsAlbums => 'Albòm';

  @override
  String get newsNews => 'Nouvèl';

  @override
  String get newsPodcast => 'Podkast';

  @override
  String get newsAlbum => 'Albòm';

  @override
  String newsPhotos(int n) {
    return '$n foto';
  }

  @override
  String get newsEmpty => 'Pa gen anyen ki pibliye la a pou kounye a.';

  @override
  String get newsNoAudio => 'Fichye odyo epizòd sa a poko disponib.';

  @override
  String get play => 'Koute';

  @override
  String get pause => 'Kanpe';

  @override
  String get actTitle => 'Aji';

  @override
  String get actVotes => 'Vòt';

  @override
  String get actTraining => 'Fòmasyon';

  @override
  String get actEvents => 'Rasanbleman';

  @override
  String get actDues => 'Kotizasyon';

  @override
  String get actPodcasts => 'Podkast';

  @override
  String get actAlbums => 'Albòm';

  @override
  String actVotesOpen(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n vòt ouvè',
      one: '1 vòt ouvè',
      zero: 'Pa gen vòt ouvè',
    );
    return '$_temp0';
  }

  @override
  String actTrainingState(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n fòmasyon',
      one: '1 fòmasyon',
      zero: 'Pa gen fòmasyon',
    );
    return '$_temp0';
  }

  @override
  String actEventsState(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n ki pral fèt',
      one: '1 ki pral fèt',
      zero: 'Pa gen ki pral fèt',
    );
    return '$_temp0';
  }

  @override
  String get actDuesUpToDate => 'Ajou';

  @override
  String get actDuesLate => 'Pou peye';

  @override
  String get actListen => 'Koute';

  @override
  String get actSee => 'Gade';

  @override
  String get votesTitle => 'Vòt entèn';

  @override
  String get votesEmpty => 'Pa gen vòt ki konsène w pou kounye a.';

  @override
  String get votePhasePreparation => 'Lis fikse';

  @override
  String get votePhaseOpen => 'Vòt ouvè';

  @override
  String get votePhaseCounting => 'Depouyman ap fèt';

  @override
  String get votePhaseClosed => 'Depouye';

  @override
  String get votePhasePublished => 'Rezilta sètifye';

  @override
  String get voteChooseOne => 'Make yon kaz.';

  @override
  String voteChooseUpTo(int n) {
    return 'Make jiska $n non.';
  }

  @override
  String get voteBlank => 'Vote blan';

  @override
  String get voteSecret => 'Vòt ou sekrè : bilten ou pa gen non w sou li.';

  @override
  String get voteSubmit => 'Depoze bilten mwen';

  @override
  String get voteConfirmTitle => 'Depoze bilten sa a ?';

  @override
  String get voteConfirmLead => 'Depi ou depoze l, ou pa ka chanje l ankò.';

  @override
  String get voteConfirm => 'Depoze';

  @override
  String get cancel => 'Anile';

  @override
  String get voteDone => 'Bilten depoze';

  @override
  String get voteReceipt => 'Kòd resi ou';

  @override
  String get voteReceiptLead =>
      'Ekri l : li pa anrejistre okenn kote. Apre depouyman an, li pèmèt ou verifye yo konte bilten ou, san moun pa konnen chwa w.';

  @override
  String get voteCopy => 'Kopye kòd la';

  @override
  String get voteCopied => 'Kòd la kopye';

  @override
  String get voteAlready => 'Ou deja vote nan tou sa a.';

  @override
  String voteOpensAt(String date) {
    return 'Vòt la ouvri $date.';
  }

  @override
  String get voteNotOpen => 'Vòt la pa ouvè.';

  @override
  String get voteResults => 'Rezilta';

  @override
  String voteVotes(int n) {
    return '$n vwa';
  }

  @override
  String get voteElected => 'Eli';

  @override
  String get voteAdopted => 'Pwopozisyon an pase';

  @override
  String get voteRejected => 'Pwopozisyon an rejte';

  @override
  String voteTurnout(String p) {
    return 'Patisipasyon : $p %';
  }

  @override
  String get voteVerify => 'Verifye bilten mwen';

  @override
  String get voteVerifyLabel => 'Kòd resi';

  @override
  String get voteVerifyOk => 'Bilten ou nan jounal la : yo konte l.';

  @override
  String get voteVerifyMissing => 'Kòd sa a pa nan jounal la. Verifye sa ou tape a.';

  @override
  String get voteRound2 => 'Dezyèm tou';

  @override
  String get coursesTitle => 'Fòmasyon';

  @override
  String get coursesEmpty => 'Pa gen fòmasyon pou kounye a.';

  @override
  String get courseMandatory => 'Obligatwa';

  @override
  String get courseDone => 'Fini';

  @override
  String courseModule(int n) {
    return 'Modil $n';
  }

  @override
  String get courseLocked => 'Reyisi modil anvan an pou ouvri sa a.';

  @override
  String get courseQuiz => 'Pase kesyonè a';

  @override
  String get coursePassed => 'Modil la reyisi';

  @override
  String get courseOpenVideo => 'Gade videyo a';

  @override
  String get courseOpenFile => 'Ouvri dokiman an';

  @override
  String get courseViewed => 'Li';

  @override
  String get quizTitle => 'Kesyonè';

  @override
  String get quizSubmit => 'Valide repons mwen yo';

  @override
  String quizScore(int s) {
    return 'Nòt : $s %';
  }

  @override
  String get quizPassed => 'Ou reyisi. Pwochen modil la ouvè.';

  @override
  String get quizFailed => 'Poko. Revize kesyon ki make yo epi eseye ankò.';

  @override
  String quizAttemptsLeft(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n esè ki rete',
      one: '1 esè ki rete',
      zero: 'Pa gen esè ankò',
    );
    return '$_temp0';
  }

  @override
  String quizCertificate(String n) {
    return 'Sètifika nimewo $n';
  }

  @override
  String get quizWrong => 'Pou revize';

  @override
  String get eventsTitle => 'Rasanbleman';

  @override
  String get eventsEmpty => 'Pa gen rasanbleman ki pral fèt.';

  @override
  String get eventRegister => 'Enskri m';

  @override
  String get eventUnregister => 'Retire non m';

  @override
  String get eventFull => 'Plen';

  @override
  String get duesTitle => 'Kotizasyon';

  @override
  String get duesNone => 'Pa gen kotizasyon ki prevwa.';

  @override
  String get duesStatePaid => 'Peye';

  @override
  String get duesStateDue => 'Pou peye';

  @override
  String get duesStateLate => 'An reta';

  @override
  String get duesStateUpcoming => 'Pral rive';

  @override
  String get duesPayHint => 'Peye kay trezorye seksyon w ; peman MonCash ak NatCash ap vini nan aplikasyon an.';

  @override
  String get meTitle => 'Mwen';

  @override
  String get podcastDownload => 'Telechaje l pou koute l san entènèt';

  @override
  String get podcastDownloaded => 'Disponib san entènèt';

  @override
  String get podcastDownloading => 'Telechajman…';

  @override
  String get welcomeSignInLead =>
      'Tape adrès imèl òganizasyon w konnen an : w ap resevwa yon kòd 6 chif, epi aplikasyon an ouvri espas ou.';

  @override
  String get welcomeUsePhone => 'Sèvi ak nimewo telefòn mwen';

  @override
  String get welcomeUseEmail => 'Sèvi ak adrès imèl mwen';

  @override
  String get welcomeJoinOrg => 'Ou poko manm ? Rantre nan yon òganizasyon';

  @override
  String otpLeadAny(String destination) {
    return 'Si yon òganizasyon konnen $destination, nou fèk voye yon kòd ba li. Li bon pou 10 minit.';
  }
}

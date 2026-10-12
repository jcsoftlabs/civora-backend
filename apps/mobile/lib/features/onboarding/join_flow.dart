import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';

/// Organisation choisie avant la connexion : nom, couleur, moyens d'envoi du code.
class PartyInfo {
  const PartyInfo({
    required this.slug,
    required this.name,
    required this.brandColor,
    required this.kind,
    required this.channels,
    this.admissionMode = 'validation',
  });
  final String admissionMode;
  final String slug;
  final String name;
  final String? brandColor;
  final String kind;
  final List<String> channels;
}

class JoinState {
  const JoinState({this.party, this.channel, this.destination, this.challengeId, this.sponsorCode, this.adhesion});
  final PartyInfo? party;
  final String? channel;
  final String? destination;
  final String? challengeId;

  /// Code de parrainage reçu dans un lien ou un QR (`?parrain=`), prérempli à l'adhésion.
  final String? sponsorCode;

  /// Fiche d'adhésion en cours : le code reçu par e-mail la confirme (POST /join/complete).
  final Map<String, Object>? adhesion;

  JoinState copy({String? challengeId, String? destination, Map<String, Object>? adhesion}) => JoinState(
    party: party,
    channel: channel,
    destination: destination ?? this.destination,
    challengeId: challengeId ?? this.challengeId,
    sponsorCode: sponsorCode,
    adhesion: adhesion ?? this.adhesion,
  );
}

/// Étapes de la connexion : organisation, puis code envoyé, puis session. Rien n'est conservé après.
class JoinFlow extends Notifier<JoinState> {
  @override
  JoinState build() => const JoinState();

  /// Code, lien d'invitation ou contenu du QR : on en tire l'identifiant de l'organisation.
  static String? slugFrom(String raw) {
    final v = raw.trim().toLowerCase();
    if (RegExp(r'^[a-z0-9][a-z0-9-]{1,62}$').hasMatch(v)) return v;
    final uri = Uri.tryParse(v.contains('://') ? v : 'https://$v');
    if (uri == null || uri.host.isEmpty) return null;
    final parts = uri.pathSegments;
    final i = parts.indexWhere((p) => p == 'rejoindre' || p == 'join');
    if (i >= 0 && i + 1 < parts.length) return parts[i + 1];
    final labels = uri.host.split('.');
    if (labels.length >= 2 && !['www', 'console', 'api'].contains(labels.first)) return labels.first;
    return null;
  }

  /// Code de parrainage d'un lien d'invitation (`…/rejoindre?parrain=FARA-7K3Q`), ou null.
  static String? sponsorFrom(String raw) {
    final uri = Uri.tryParse(raw.trim().contains('://') ? raw.trim() : 'https://${raw.trim()}');
    final code = uri?.queryParameters['parrain']?.toUpperCase();
    return code != null && RegExp(r'^[A-Z]{4}-[A-Z0-9]{4}$').hasMatch(code) ? code : null;
  }

  Future<PartyInfo> choose(String slug, {String? sponsorCode}) async {
    final j = await ApiClient().get('/join/$slug');
    final party = PartyInfo(
      slug: slug,
      name: j['name'] as String,
      brandColor: j['brandColor'] as String?,
      kind: (j['kind'] as String?) ?? 'party',
      channels: ((j['otpChannels'] as List?) ?? const ['email']).cast<String>(),
      admissionMode: (j['admissionMode'] as String?) ?? 'validation',
    );
    state = JoinState(party: party, sponsorCode: sponsorCode);
    return party;
  }

  /// Demande d'un code. Sans organisation choisie, l'API la retrouve d'après l'adresse (et ne la révèle
  /// qu'après le bon code).
  Future<void> requestCode(String channel, String destination) async {
    final p = state.party;
    final r = await ApiClient().post('/auth/otp/request', {
      'partySlug': ?p?.slug,
      'channel': channel,
      'destination': destination,
    });
    state = JoinState(party: p, channel: channel, destination: destination, challengeId: r['challengeId'] as String);
  }

  /// Vérifie le code : session de l'application (espace membre, jusqu'à la déconnexion) et son organisation.
  Future<Map<String, dynamic>> verify(String code) => ApiClient().post('/auth/otp/verify', {
    'partySlug': ?state.party?.slug,
    'challengeId': state.challengeId,
    'code': code,
    'client': 'app',
  });

  /// Adhésion (ADH-01) : la fiche est gardée, un code part à l'adresse e-mail pour la confirmer.
  Future<void> startAdhesion(Map<String, Object> fiche, String email, String locale) async {
    final r = await ApiClient().post('/join/start', {'partySlug': state.party!.slug, 'email': email, 'locale': locale});
    state = state.copy(challengeId: r['challengeId'] as String, destination: email, adhesion: fiche);
  }

  /// Confirmation de l'adhésion avec le code : fiche créée, session de l'application ouverte.
  Future<Map<String, dynamic>> completeAdhesion(String code) => ApiClient().post('/join/complete', {
    'partySlug': state.party!.slug,
    'challengeId': state.challengeId,
    'code': code,
    ...state.adhesion!,
    'client': 'app',
  });

  void reset() => state = const JoinState();
}

final joinFlowProvider = NotifierProvider<JoinFlow, JoinState>(JoinFlow.new);

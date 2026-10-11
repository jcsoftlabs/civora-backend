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
  });
  final String slug;
  final String name;
  final String? brandColor;
  final String kind;
  final List<String> channels;
}

class JoinState {
  const JoinState({this.party, this.channel, this.destination, this.challengeId});
  final PartyInfo? party;
  final String? channel;
  final String? destination;
  final String? challengeId;
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

  Future<PartyInfo> choose(String slug) async {
    final j = await ApiClient().get('/join/$slug');
    final party = PartyInfo(
      slug: slug,
      name: j['name'] as String,
      brandColor: j['brandColor'] as String?,
      kind: (j['kind'] as String?) ?? 'party',
      channels: ((j['otpChannels'] as List?) ?? const ['email']).cast<String>(),
    );
    state = JoinState(party: party);
    return party;
  }

  Future<void> requestCode(String channel, String destination) async {
    final p = state.party!;
    final r = await ApiClient().post('/auth/otp/request', {
      'partySlug': p.slug,
      'channel': channel,
      'destination': destination,
    });
    state = JoinState(party: p, channel: channel, destination: destination, challengeId: r['challengeId'] as String);
  }

  /// Vérifie le code : renvoie le jeton, son expiration et l'état de la double authentification.
  Future<Map<String, dynamic>> verify(String code) => ApiClient().post('/auth/otp/verify', {
        'partySlug': state.party!.slug,
        'challengeId': state.challengeId,
        'code': code,
      });

  void reset() => state = const JoinState();
}

final joinFlowProvider = NotifierProvider<JoinFlow, JoinState>(JoinFlow.new);

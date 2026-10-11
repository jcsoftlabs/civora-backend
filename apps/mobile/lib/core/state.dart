import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'storage.dart';

const sessionStore = SessionStore();
const offlineCache = OfflineCache();

/// Session du membre (null : pas encore connecté). Une session expirée est oubliée.
class SessionNotifier extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    // Captures et essais sur le jeu de démonstration local : session passée à la compilation, en mode
    // développement seulement (`--dart-define=DEMO_SESSION=horizon:<jeton>`). Absente des versions publiées.
    const demo = String.fromEnvironment('DEMO_SESSION');
    if (kDebugMode && demo.contains(':')) {
      final i = demo.indexOf(':');
      return Session(
        slug: demo.substring(0, i),
        token: demo.substring(i + 1),
        expiresAt: DateTime.now().add(const Duration(days: 1)),
      );
    }
    final s = await sessionStore.read();
    if (s == null || s.expired) return null;
    return s;
  }

  Future<void> open(Session s) async {
    await sessionStore.write(s);
    state = AsyncData(s);
  }

  Future<void> close() async {
    final s = state.value;
    if (s != null) {
      try {
        await ApiClient(token: s.token).post('/auth/logout');
      } on ApiError {
        // Hors ligne : la session est oubliée sur le téléphone, elle expirera côté serveur.
      }
      await offlineCache.clear(s.slug);
    }
    await sessionStore.clear();
    state = const AsyncData(null);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, Session?>(SessionNotifier.new);

/// Langue de l'app : français ou créole, choisie par le membre (français par défaut).
class LocaleNotifier extends Notifier<Locale> {
  static const _storage = FlutterSecureStorage();
  static const _key = 'civora.locale';

  @override
  Locale build() {
    _storage.read(key: _key).then((v) {
      if (v == 'ht' || v == 'fr') state = Locale(v!);
    });
    final device = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return Locale(device == 'ht' ? 'ht' : 'fr');
  }

  void set(Locale l) {
    state = l;
    _storage.write(key: _key, value: l.languageCode);
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

/// Réponse de l'API, ou la dernière enregistrée quand le réseau manque (`offline`).
class Loaded {
  const Loaded(this.data, {this.offline = false});
  final Map<String, dynamic> data;
  final bool offline;
}

/// Lecture avec repli hors ligne : chaque réponse réussie est enregistrée pour l'organisation du membre.
final apiGet = FutureProvider.autoDispose.family<Loaded, String>((ref, path) async {
  final s = ref.watch(sessionProvider).value;
  if (s == null) throw ApiError(401, 'unauthenticated');
  try {
    final data = await ApiClient(token: s.token).get(path);
    await offlineCache.write(s.slug, path, data);
    return Loaded(data);
  } on ApiError catch (e) {
    if (e.status == 401) {
      await ref.read(sessionProvider.notifier).close();
      rethrow;
    }
    final cached = await offlineCache.read(s.slug, path);
    if (cached != null) return Loaded(cached, offline: true);
    rethrow;
  }
});

/// Texte bilingue de l'API ({fr, ht?}) dans la langue choisie, le français à défaut.
String tr(Object? value, Locale locale) {
  if (value is Map) {
    final ht = value['ht'];
    if (locale.languageCode == 'ht' && ht is String && ht.isNotEmpty) return ht;
    return (value['fr'] as String?) ?? '';
  }
  return value is String ? value : '';
}

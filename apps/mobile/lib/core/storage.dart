import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

/// Session du membre : jeton dans le trousseau du téléphone (Keychain, Keystore), jamais en clair sur le disque.
class Session {
  const Session({required this.slug, required this.token, required this.expiresAt});
  final String slug;
  final String token;
  final DateTime expiresAt;

  bool get expired => DateTime.now().isAfter(expiresAt);

  Map<String, dynamic> toJson() => {'slug': slug, 'token': token, 'expiresAt': expiresAt.toIso8601String()};
  static Session fromJson(Map<String, dynamic> j) => Session(
        slug: j['slug'] as String,
        token: j['token'] as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
      );
}

class SessionStore {
  const SessionStore();
  static const _key = 'civora.session';
  static const _storage = FlutterSecureStorage();

  Future<Session?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      return Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on Object {
      return null;
    }
  }

  Future<void> write(Session s) => _storage.write(key: _key, value: jsonEncode(s.toJson()));
  Future<void> clear() => _storage.delete(key: _key);
}

/// Dernières réponses de l'API, par organisation : la carte et l'accueil restent lisibles sans connexion.
/// Aucune donnée sensible (pièce d'identité) ne passe par ici.
class OfflineCache {
  const OfflineCache();

  Future<File> _file(String slug, String key) async {
    final dir = await getApplicationSupportDirectory();
    final safe = key.replaceAll(RegExp(r'[^a-z0-9_-]'), '_');
    return File('${dir.path}/cache/$slug/$safe.json');
  }

  Future<Map<String, dynamic>?> read(String slug, String key) async {
    try {
      final f = await _file(slug, key);
      if (!await f.exists()) return null;
      return jsonDecode(await f.readAsString()) as Map<String, dynamic>;
    } on Object {
      return null;
    }
  }

  Future<void> write(String slug, String key, Map<String, dynamic> data) async {
    final f = await _file(slug, key);
    await f.parent.create(recursive: true);
    await f.writeAsString(jsonEncode(data));
  }

  Future<void> clear(String slug) async {
    final dir = await getApplicationSupportDirectory();
    final d = Directory('${dir.path}/cache/$slug');
    if (await d.exists()) await d.delete(recursive: true);
  }
}

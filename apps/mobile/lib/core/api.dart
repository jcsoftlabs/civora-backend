import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

/// Erreur renvoyée par l'API : code stable (traduit à l'écran), jamais de détail technique.
class ApiError implements Exception {
  ApiError(this.status, this.code);
  final int status;
  final String code;

  /// Pas de réseau ou serveur injoignable : l'app bascule sur les données enregistrées.
  bool get offline => status == 0;

  @override
  String toString() => 'ApiError($status, $code)';
}

class ApiClient {
  ApiClient({this.token, http.Client? client}) : _http = client ?? http.Client();
  final String? token;
  final http.Client _http;

  Future<Map<String, dynamic>> get(String path) => _send('GET', path);
  Future<Map<String, dynamic>> post(String path, [Object? body]) => _send('POST', path, body);
  Future<Map<String, dynamic>> delete(String path) => _send('DELETE', path);
  Future<Map<String, dynamic>> put(String path, Object? body) => _send('PUT', path, body);

  Future<Map<String, dynamic>> _send(String method, String path, [Object? body]) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))
      ..headers.addAll({
        'accept': 'application/json',
        if (body != null) 'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      });
    if (body != null) req.body = jsonEncode(body);
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 15)));
    } on Exception {
      throw ApiError(0, 'offline');
    }
    if (res.statusCode == 204) return const {};
    Map<String, dynamic> json;
    try {
      final decoded = jsonDecode(utf8.decode(res.bodyBytes));
      json = decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    } on FormatException {
      json = const {};
    }
    if (res.statusCode >= 400) throw ApiError(res.statusCode, (json['code'] as String?) ?? 'generic');
    return json;
  }
}

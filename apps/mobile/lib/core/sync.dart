import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import 'api.dart';
import 'state.dart';
import 'storage.dart';

/// Hors ligne (NFR-01). Deux mécanismes :
/// - une file d'opérations : chaque saisie faite sans réseau reçoit un UUID et son heure d'origine, reste sur le
///   téléphone, puis part par lots au retour du réseau (POST /sync, rejouable sans double effet) ;
/// - un préchargement : à l'ouverture et au retour au premier plan, l'app enregistre la carte, la fiche, les
///   formations, l'agenda et les actualités, pour qu'ils restent lisibles sans réseau.

/// UUID version 4 tiré au sort sur le téléphone.
String newUuid() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class SyncOp {
  const SyncOp({required this.id, required this.kind, required this.payload, required this.createdAt, this.rejected});
  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;

  /// Raison du refus du serveur (l'opération n'est plus renvoyée), sinon null : en attente d'envoi.
  final String? rejected;

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind,
    'payload': payload,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'rejected': ?rejected,
  };

  static SyncOp fromJson(Map<String, dynamic> j) => SyncOp(
    id: j['id'] as String,
    kind: j['kind'] as String,
    payload: Map<String, dynamic>.from(j['payload'] as Map),
    createdAt: DateTime.parse(j['createdAt'] as String),
    rejected: j['rejected'] as String?,
  );

  SyncOp reject(String code) => SyncOp(id: id, kind: kind, payload: payload, createdAt: createdAt, rejected: code);
}

/// File locale, un fichier par organisation (la session d'un parti n'envoie jamais les saisies d'un autre).
class SyncQueueStore {
  const SyncQueueStore();

  Future<File> _file(String slug) async {
    final dir = await getApplicationSupportDirectory();
    return File('${dir.path}/sync/$slug.json');
  }

  Future<List<SyncOp>> read(String slug) async {
    try {
      final f = await _file(slug);
      if (!await f.exists()) return [];
      return (jsonDecode(await f.readAsString()) as List)
          .map((e) => SyncOp.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } on Object {
      return [];
    }
  }

  /// Écriture atomique : un fichier temporaire, puis renommage (pas de file à moitié écrite si l'app est tuée).
  Future<void> write(String slug, List<SyncOp> ops) async {
    final f = await _file(slug);
    await f.parent.create(recursive: true);
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode(ops.map((o) => o.toJson()).toList()), flush: true);
    await tmp.rename(f.path);
  }
}

/// Identifiant de l'appareil (pour le journal des opérations), créé une fois.
Future<String> deviceId() async {
  const storage = FlutterSecureStorage();
  const key = 'civora.device';
  final known = await storage.read(key: key);
  if (known != null) return known;
  final id = newUuid();
  await storage.write(key: key, value: id);
  return id;
}

class SyncState {
  const SyncState({this.ops = const [], this.sending = false});
  final List<SyncOp> ops;
  final bool sending;

  List<SyncOp> get pending => ops.where((o) => o.rejected == null).toList();

  /// Les chapitres vus sans réseau s'affichent déjà « vus » (le serveur confirmera).
  Set<String> pendingIds(String kind, String field) =>
      pending.where((o) => o.kind == kind).map((o) => '${o.payload[field]}').toSet();
}

class SyncNotifier extends Notifier<SyncState> {
  static const _store = SyncQueueStore();
  final _lock = _Mutex();

  @override
  SyncState build() {
    final slug = ref.watch(sessionProvider).value?.slug;
    if (slug != null) {
      _store.read(slug).then((ops) {
        state = SyncState(ops: ops);
        unawaited(flush());
      });
    }
    return const SyncState();
  }

  /// Enregistre une saisie sur le téléphone, puis tente l'envoi.
  Future<void> record(String kind, Map<String, dynamic> payload) async {
    final slug = ref.read(sessionProvider).value?.slug;
    if (slug == null) return;
    await _lock.run(() async {
      final ops = [
        ...await _store.read(slug),
        SyncOp(id: newUuid(), kind: kind, payload: payload, createdAt: DateTime.now()),
      ];
      await _store.write(slug, ops);
      state = SyncState(ops: ops, sending: state.sending);
    });
    await flush();
  }

  /// Envoie les opérations en attente par lots de 50. Sans réseau, elles restent pour la prochaine fois.
  Future<void> flush() async {
    final session = ref.read(sessionProvider).value;
    if (session == null) return;
    await _lock.run(() async {
      var ops = await _store.read(session.slug);
      if (ops.every((o) => o.rejected != null)) return;
      state = SyncState(ops: ops, sending: true);
      final device = await deviceId();
      var applied = false;
      try {
        while (true) {
          final batch = ops.where((o) => o.rejected == null).take(50).toList();
          if (batch.isEmpty) break;
          final r = await ApiClient(token: session.token).post('/sync', {
            'deviceId': device,
            'operations': [
              for (final o in batch)
                {'id': o.id, 'kind': o.kind, 'payload': o.payload, 'createdAt': o.toJson()['createdAt']},
            ],
          });
          final results = {for (final x in ((r['results'] as List?) ?? const []).cast<Map>()) x['id'] as String: x};
          if (results.values.any((x) => x['status'] == 'applied')) applied = true;
          ops = [
            for (final o in ops)
              if (results[o.id] case final res?)
                if (res['status'] == 'rejected') o.reject('${res['code']}') else null
              else
                o,
          ].whereType<SyncOp>().toList();
          await _store.write(session.slug, ops);
        }
      } on ApiError {
        // Hors ligne ou serveur injoignable : on réessaiera au prochain retour du réseau.
      } finally {
        state = SyncState(ops: ops);
        // Le serveur a pris en compte des saisies : les écrans relisent leurs données.
        if (applied) ref.invalidate(apiGet);
      }
    });
  }
}

final syncProvider = NotifierProvider<SyncNotifier, SyncState>(SyncNotifier.new);

/// Une seule écriture de la file à la fois.
class _Mutex {
  Future<void> _last = Future.value();
  Future<void> run(Future<void> Function() body) {
    final next = _last.then((_) => body()).catchError((_) {});
    _last = next;
    return next;
  }
}

/// Préchargement : ce que le membre doit pouvoir relire sans réseau. Les formations ouvertes sont gardées
/// entières (textes compris) ; leurs médias se téléchargent depuis l'écran de la formation.
Future<void> prefetch(Session s) async {
  const cache = OfflineCache();
  final api = ApiClient(token: s.token);
  Future<Map<String, dynamic>?> keep(String path) async {
    try {
      final data = await api.get(path);
      await cache.write(s.slug, path, data);
      return data;
    } on ApiError {
      return null;
    }
  }

  await Future.wait([
    for (final p in [
      '/auth/me',
      '/members/me',
      '/members/me/card',
      '/members/me/card-design',
      '/members/me/dues',
      '/members/me/points',
      '/events',
      '/votes',
      '/feed?limit=50',
    ])
      keep(p),
  ]);
  final training = await keep('/training');
  for (final c in ((training?['courses'] as List?) ?? const []).cast<Map>()) {
    await keep('/training/${c['id']}');
  }
}

/// Synchronise et précharge à l'ouverture, au retour au premier plan, et toutes les deux minutes.
class SyncScope extends ConsumerStatefulWidget {
  const SyncScope({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<SyncScope> createState() => _SyncScopeState();
}

class _SyncScopeState extends ConsumerState<SyncScope> with WidgetsBindingObserver {
  Timer? _timer;
  DateTime? _lastPrefetch;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => _tick(prefetching: false));
    WidgetsBinding.instance.addPostFrameCallback((_) => _tick());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _tick();
  }

  Future<void> _tick({bool prefetching = true}) async {
    final s = ref.read(sessionProvider).value;
    if (s == null) return;
    await ref.read(syncProvider.notifier).flush();
    // Au plus un préchargement complet toutes les dix minutes : forfaits comptés.
    final now = DateTime.now();
    if (prefetching && (_lastPrefetch == null || now.difference(_lastPrefetch!) > const Duration(minutes: 10))) {
      _lastPrefetch = now;
      await prefetch(s);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (prev, next) {
      if (prev?.value == null && next.value != null) {
        _lastPrefetch = null;
        _tick();
      }
    });
    return widget.child;
  }
}

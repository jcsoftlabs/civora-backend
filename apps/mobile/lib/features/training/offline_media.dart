import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/media.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';

/// Médias des formations gardés sur le téléphone (NFR-01) : audio, vidéo envoyée par le parti, documents. Les liens
/// de l'API sont signés pour une heure ; le fichier téléchargé, lui, reste. Les vidéos YouTube et Vimeo demandent
/// toujours le réseau.

Future<File> chapterFile(String slug, Map chapter) async {
  final dir = await getApplicationSupportDirectory();
  final name = ((chapter['media'] as Map?)?['name'] as String?) ?? '';
  final dot = name.lastIndexOf('.');
  final ext = dot > 0 ? name.substring(dot + 1).replaceAll(RegExp(r'[^A-Za-z0-9]'), '') : 'bin';
  return File('${dir.path}/formations/$slug/${chapter['id']}.$ext');
}

/// Chapitres d'une formation dont le média peut être gardé : modules ouverts, fichier envoyé au parti.
List<Map> downloadableChapters(Map course) => [
  for (final m in ((course['modules'] as List?) ?? const []).cast<Map>())
    if (m['locked'] != true)
      for (final ch in ((m['chapters'] as List?) ?? const []).cast<Map>())
        if ((ch['media'] as Map?)?['url'] != null) ch,
];

/// Médias de la formation déjà sur le téléphone, sur le total gardable.
final courseOfflineProvider = FutureProvider.autoDispose.family<(int, int), String>((ref, coursePath) async {
  final s = ref.watch(sessionProvider).value;
  final course = ref.watch(apiGet(coursePath)).value?.data;
  if (s == null || course == null) return (0, 0);
  final list = downloadableChapters(course);
  var have = 0;
  for (final ch in list) {
    if (await (await chapterFile(s.slug, ch)).exists()) have++;
  }
  return (have, list.length);
});

/// Bouton « garder les médias » : télécharge ce qui manque, un fichier à la fois (réseau lent, mémoire limitée).
class CourseOfflineButton extends ConsumerStatefulWidget {
  const CourseOfflineButton({super.key, required this.coursePath});
  final String coursePath;

  @override
  ConsumerState<CourseOfflineButton> createState() => _CourseOfflineButtonState();
}

class _CourseOfflineButtonState extends ConsumerState<CourseOfflineButton> {
  bool _busy = false;

  Future<void> _download() async {
    final t = L.of(context);
    final s = ref.read(sessionProvider).value;
    final course = ref.read(apiGet(widget.coursePath)).value?.data;
    if (s == null || course == null) return;
    setState(() => _busy = true);
    var failed = false;
    for (final ch in downloadableChapters(course)) {
      final f = await chapterFile(s.slug, ch);
      if (await f.exists()) continue;
      try {
        final res = await http
            .get(Uri.parse(mediaUrl((ch['media'] as Map)['url'] as String)))
            .timeout(const Duration(minutes: 5));
        if (res.statusCode != 200) throw HttpException('${res.statusCode}');
        await f.parent.create(recursive: true);
        final tmp = File('${f.path}.part');
        await tmp.writeAsBytes(res.bodyBytes, flush: true);
        await tmp.rename(f.path);
      } on Object {
        failed = true;
      }
    }
    ref.invalidate(courseOfflineProvider(widget.coursePath));
    if (!mounted) return;
    setState(() => _busy = false);
    if (failed) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.courseOfflineFailed)));
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final (have, total) = ref.watch(courseOfflineProvider(widget.coursePath)).value ?? (0, 0);
    if (total == 0) return const SizedBox.shrink();
    if (have == total) {
      return Row(
        children: [
          const Icon(Icons.download_done, size: 20, color: Palette.success),
          const SizedBox(width: 8),
          Expanded(
            child: Text(t.courseOfflineReady, style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      );
    }
    return OutlinedButton.icon(
      onPressed: _busy ? null : _download,
      icon: const Icon(Icons.download_outlined),
      label: Text(_busy ? t.courseOfflineBusy : t.courseOfflineDownload(total - have)),
    );
  }
}

/// Ouvre un média gardé sur le téléphone : l'audio se lit dans l'app, le reste passe par la feuille du système
/// (lecteur vidéo, visionneuse de documents).
Future<bool> openLocalChapter(BuildContext context, String slug, Map chapter) async {
  final f = await chapterFile(slug, chapter);
  if (!await f.exists() || !context.mounted) return false;
  final mime = ((chapter['media'] as Map?)?['mimeType'] as String?) ?? '';
  if (mime.startsWith('audio/')) {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _AudioChapter(file: f, title: chapter['title']),
      ),
    );
  } else {
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(f.path, mimeType: mime.isEmpty ? null : mime)],
        sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  }
  return true;
}

class _AudioChapter extends StatefulWidget {
  const _AudioChapter({required this.file, required this.title});
  final File file;
  final Object? title;

  @override
  State<_AudioChapter> createState() => _AudioChapterState();
}

class _AudioChapterState extends State<_AudioChapter> {
  final _player = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _player.setFilePath(widget.file.path).then((_) => _player.play());
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final brand = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(tr(widget.title, Localizations.localeOf(context)), style: Txt.title),
            const SizedBox(height: Space.l),
            StreamBuilder<Duration>(
              stream: _player.positionStream,
              builder: (_, snap) {
                final total = _player.duration ?? Duration.zero;
                final pos = snap.data ?? Duration.zero;
                return LinearProgressIndicator(
                  value: total.inMilliseconds == 0 ? 0 : pos.inMilliseconds / total.inMilliseconds,
                  color: brand,
                  backgroundColor: Palette.line,
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                );
              },
            ),
            const SizedBox(height: Space.l),
            StreamBuilder<PlayerState>(
              stream: _player.playerStateStream,
              builder: (_, snap) {
                final playing = snap.data?.playing ?? false;
                return FilledButton.icon(
                  onPressed: playing ? _player.pause : _player.play,
                  icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                  label: Text(playing ? t.pause : t.play),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

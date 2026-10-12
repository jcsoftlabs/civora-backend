import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/media.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';

/// Épisode enregistré sur le téléphone (écoute hors ligne, NFR-01), rangé par identifiant de publication.
Future<File> _episodeFile(String id) async {
  final dir = await getApplicationSupportDirectory();
  return File('${dir.path}/podcasts/$id.audio');
}

/// Podcast : fond pétrole profond, bouton de lecture ambre, barre de progression ; téléchargement pour
/// l'écouter sans connexion. Le lien de l'API est signé pour une heure : l'épisode téléchargé, lui, reste.
class PodcastCard extends StatefulWidget {
  const PodcastCard({
    super.key,
    required this.id,
    required this.label,
    required this.title,
    required this.body,
    required this.audioUrl,
  });
  final String id;
  final String label;
  final String title;
  final String body;
  final String? audioUrl;

  @override
  State<PodcastCard> createState() => _PodcastCardState();
}

class _PodcastCardState extends State<PodcastCard> {
  final _player = AudioPlayer();
  bool _ready = false;
  bool _local = false;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    _episodeFile(widget.id).then((f) async {
      if (await f.exists() && mounted) setState(() => _local = true);
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_player.playing) return _player.pause();
    if (!_ready) {
      final f = await _episodeFile(widget.id);
      if (await f.exists()) {
        await _player.setFilePath(f.path);
      } else if (widget.audioUrl != null) {
        await _player.setUrl(mediaUrl(widget.audioUrl!));
      } else {
        return;
      }
      _ready = true;
    }
    await _player.play();
  }

  Future<void> _download() async {
    if (widget.audioUrl == null) return;
    setState(() => _downloading = true);
    try {
      final res = await http.get(Uri.parse(mediaUrl(widget.audioUrl!)));
      if (res.statusCode == 200) {
        final f = await _episodeFile(widget.id);
        await f.parent.create(recursive: true);
        await f.writeAsBytes(res.bodyBytes);
        if (mounted) setState(() => _local = true);
      }
    } on Exception {
      // Hors ligne : le bouton reste disponible pour réessayer.
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  String _clock(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final playable = widget.audioUrl != null || _local;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
      decoration: BoxDecoration(color: Palette.primaryDeep, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.mic_none, size: 16, color: Palette.accent),
              const SizedBox(width: 6),
              Expanded(
                child: Text(widget.label, style: const TextStyle(fontSize: 12, color: Color(0xFFBFD0CC))),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            widget.title,
            style: const TextStyle(color: Palette.paper, fontSize: 17, fontWeight: FontWeight.w600, height: 1.25),
          ),
          if (widget.body.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              widget.body,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFD9E3E0), fontSize: 14, height: 1.45),
            ),
          ],
          const SizedBox(height: 14),
          if (!playable)
            Text(t.newsNoAudio, style: const TextStyle(color: Color(0xFFBFD0CC), fontSize: 13))
          else
            StreamBuilder<PlayerState>(
              stream: _player.playerStateStream,
              builder: (context, snap) {
                final playing = snap.data?.playing ?? false;
                return Row(
                  children: [
                    Semantics(
                      button: true,
                      label: playing ? t.pause : t.play,
                      child: Material(
                        color: Palette.accent,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _toggle,
                          child: SizedBox.square(
                            dimension: 48,
                            child: Icon(playing ? Icons.pause : Icons.play_arrow, color: Palette.ink, size: 28),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: StreamBuilder<Duration>(
                        stream: _player.positionStream,
                        builder: (context, pos) {
                          final total = _player.duration ?? Duration.zero;
                          final p = pos.data ?? Duration.zero;
                          final ratio = total.inMilliseconds == 0 ? 0.0 : p.inMilliseconds / total.inMilliseconds;
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(
                                  value: ratio.clamp(0, 1),
                                  minHeight: 5,
                                  color: Palette.accent,
                                  backgroundColor: Palette.paper.withValues(alpha: 0.2),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                total == Duration.zero ? '' : '${_clock(p)} / ${_clock(total)}',
                                style: const TextStyle(color: Color(0xFFBFD0CC), fontSize: 12),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          if (widget.audioUrl != null || _local) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Palette.paper, padding: EdgeInsets.zero),
              onPressed: _local || _downloading ? null : _download,
              icon: Icon(_local ? Icons.offline_pin_outlined : Icons.download_outlined, size: 18),
              label: Text(_local ? t.podcastDownloaded : (_downloading ? t.podcastDownloading : t.podcastDownload)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Album : planche de quatre photos au plus, comme des tirages posés sur le tableau.
class AlbumCard extends StatelessWidget {
  const AlbumCard({
    super.key,
    required this.label,
    required this.title,
    required this.images,
    this.onTap,
    this.tilt = 0,
  });
  final String label;
  final String title;
  final List<String> images;
  final VoidCallback? onTap;
  final double tilt;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: tilt,
      child: Material(
        color: Palette.surface,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (images.isNotEmpty)
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                    children: [
                      for (final u in images.take(4))
                        Image.network(
                          mediaUrl(u),
                          fit: BoxFit.cover,
                          cacheWidth: 400,
                          errorBuilder: (_, _, _) => const ColoredBox(color: Palette.line),
                          loadingBuilder: (_, child, p) => p == null ? child : const Skeleton(radius: 0),
                        ),
                    ],
                  ),
                const SizedBox(height: 10),
                Text(label, style: const TextStyle(fontSize: 12, color: Palette.ink2)),
                const SizedBox(height: 2),
                Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Album en plein écran : photos à faire défiler, zoom au doigt.
class AlbumScreen extends StatelessWidget {
  const AlbumScreen({super.key, required this.title, required this.images});
  final String title;
  final List<Map> images;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.ink,
    appBar: AppBar(backgroundColor: Palette.ink, foregroundColor: Palette.paper, title: Text(title)),
    body: PageView(
      children: [
        for (final m in images)
          InteractiveViewer(
            child: Center(
              child: Image.network(
                mediaUrl(m['url'] as String),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Palette.ink2),
              ),
            ),
          ),
      ],
    ),
  );
}

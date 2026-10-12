import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/media.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/objects.dart';

/// Épisode enregistré sur le téléphone (écoute hors ligne, NFR-01), rangé par identifiant de publication.
Future<File> _episodeFile(String id) async {
  final dir = await getApplicationSupportDirectory();
  return File('${dir.path}/podcasts/$id.audio');
}

/// Podcast : fond pétrole profond, bouton de lecture ambre, barre de progression ; téléchargement pour
/// l'écouter sans connexion. Le lien de l'API est signé pour une heure : l'épisode téléchargé, lui, reste.
class PodcastCard extends StatefulWidget {
  const PodcastCard({super.key, required this.id, required this.header, required this.body, required this.audioUrl});
  final String id;
  final List<Widget> header;
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
    final brand = Theme.of(context).colorScheme.primary;
    final playable = widget.audioUrl != null || _local;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...widget.header,
        if (widget.body.isNotEmpty) ...[
          const SizedBox(height: Space.s),
          Text(widget.body, maxLines: 3, overflow: TextOverflow.ellipsis, style: Txt.body),
        ],
        const SizedBox(height: Space.m),
        if (!playable)
          Text(t.newsNoAudio, style: Txt.small)
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
                    excludeSemantics: true,
                    child: Material(
                      color: brand,
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _toggle,
                        child: SizedBox.square(
                          dimension: 48,
                          child: Icon(playing ? Icons.pause : Icons.play_arrow, color: onColor(brand), size: 28),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: Space.m),
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
                              borderRadius: BorderRadius.circular(2),
                              child: LinearProgressIndicator(
                                value: ratio.clamp(0, 1),
                                minHeight: 4,
                                color: brand,
                                backgroundColor: Palette.line,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(total == Duration.zero ? '' : '${_clock(p)} / ${_clock(total)}', style: Txt.small),
                          ],
                        );
                      },
                    ),
                  ),
                  IconButton(
                    tooltip: _local ? t.podcastDownloaded : t.podcastDownload,
                    onPressed: _local || _downloading ? null : _download,
                    icon: Icon(_local ? Icons.offline_pin : Icons.download_outlined),
                    color: _local ? brand : Palette.ink2,
                  ),
                ],
              );
            },
          ),
      ],
    );
  }
}

/// Album : trois tirages en bandeau, le reste en chiffre ; tout l'album s'ouvre en plein écran.
class AlbumCard extends StatelessWidget {
  const AlbumCard({super.key, required this.header, required this.images, this.onTap});
  final List<Widget> header;
  final List<String> images;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...header,
          if (images.isNotEmpty) ...[
            const SizedBox(height: Space.m),
            SizedBox(
              height: 112,
              child: Row(
                children: [
                  for (final (i, u) in images.take(3).indexed) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          mediaUrl(u),
                          fit: BoxFit.cover,
                          height: 112,
                          cacheWidth: 360,
                          errorBuilder: (_, _, _) => const ColoredBox(color: Palette.line),
                          loadingBuilder: (_, child, p) => p == null ? child : const Skeleton(radius: 10),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
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

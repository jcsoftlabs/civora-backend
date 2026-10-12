import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';
import 'podcast_player.dart';

/// Actualités : le fil de l'organisation (COM-01), filtré par genre. Annonces et articles épinglés au tableau,
/// podcasts avec leur lecteur, albums en planche de photos.
class NewsScreen extends ConsumerStatefulWidget {
  const NewsScreen({super.key, this.only, this.standalone = false});

  /// Genre imposé (écran Podcasts ou Albums ouvert depuis Agir) : pas de filtres.
  final String? only;
  final bool standalone;

  @override
  ConsumerState<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends ConsumerState<NewsScreen> {
  String? _kind;
  static const _tilts = [-0.022, 0.018, -0.012, 0.024, -0.018, 0.01];

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final kind = widget.only ?? _kind;
    final path = kind == null ? '/feed?limit=50' : '/feed?kind=$kind&limit=50';
    final party = (ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?)?['name'] as String? ?? '';
    final filters = [
      (null, t.newsAll),
      ('announcement', t.newsAnnouncements),
      ('news', t.newsArticles),
      ('podcast', t.newsPodcasts),
      ('album', t.newsAlbums),
    ];
    final title = switch (widget.only) {
      'podcast' => t.newsPodcasts,
      'album' => t.newsAlbums,
      _ => t.newsTitle,
    };

    final body = ListView(
      padding: EdgeInsets.only(top: widget.standalone ? 8 : MediaQuery.paddingOf(context).top),
      children: [
        if (!widget.standalone) TabHeader(eyebrow: party, title: title),
        if (widget.only == null)
          SizedBox(
            height: 64,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(22, 12, 22, 4),
              children: [
                for (final (k, label) in filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _Pill(label: label, selected: _kind == k, onTap: () => setState(() => _kind = k)),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Remote(
          path,
          skeleton: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 22),
            child: Column(children: [Skeleton(height: 110), SizedBox(height: 16), Skeleton(height: 140)]),
          ),
          builder: (l) {
            final items = (l.data['items'] as List).cast<Map>();
            if (items.isEmpty) {
              return Padding(
                padding: const EdgeInsets.all(22),
                child: Text(t.newsEmpty, style: const TextStyle(color: Palette.ink2, height: 1.45)),
              );
            }
            return Column(
              children: [
                if (l.offline)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 0, 22, 8),
                    child: OfflineBanner(text: t.offline),
                  ),
                for (final (i, p) in items.indexed)
                  Padding(
                    padding: EdgeInsets.fromLTRB(i.isEven ? 20 : 30, 12, i.isEven ? 30 : 20, 10),
                    child: _item(context, t, locale, p, _tilts[i % _tilts.length]),
                  ),
              ],
            );
          },
        ),
        bottomSpace,
      ],
    );
    if (!widget.standalone) return ColoredBox(color: Palette.board, child: body);
    return Scaffold(
      backgroundColor: Palette.board,
      appBar: AppBar(backgroundColor: Palette.board, title: Text(title)),
      body: body,
    );
  }

  Widget _item(BuildContext context, L t, Locale locale, Map p, double tilt) {
    final lang = locale.languageCode;
    final when = p['publishedAt'] is String ? formatDay(DateTime.parse(p['publishedAt'] as String), lang) : null;
    final media = ((p['media'] as List?) ?? const []).cast<Map>();
    switch (p['kind']) {
      case 'podcast':
        final audio = media.where((m) => (m['mimeType'] as String? ?? '').startsWith('audio/')).firstOrNull;
        return PodcastCard(
          label: [t.newsPodcast, when].whereType<String>().join(' · '),
          title: tr(p['title'], locale),
          body: tr(p['body'], locale),
          audioUrl: audio?['url'] as String?,
          id: p['id'] as String,
        );
      case 'album':
        final images = media.where((m) => (m['mimeType'] as String? ?? '').startsWith('image/')).toList();
        return AlbumCard(
          label: [t.newsAlbum, t.newsPhotos(images.length), when].whereType<String>().join(' · '),
          title: tr(p['title'], locale),
          images: [for (final m in images) m['url'] as String],
          onTap: images.isEmpty ? null : () => context.push('/album', extra: (tr(p['title'], locale), images)),
          tilt: tilt,
        );
      default:
        return PinnedNote(
          label: p['kind'] == 'announcement' ? t.sectionAnnouncement : t.newsNews,
          title: tr(p['title'], locale),
          body: tr(p['body'], locale).isEmpty ? null : tr(p['body'], locale),
          footnote: when,
          color: p['kind'] == 'announcement' ? Palette.cream : Palette.surface,
          tilt: tilt,
          tapeAt: tilt > 0 ? 0.7 : 0.3,
        );
    }
  }
}

/// Filtre du fil : pastille pleine encre quand elle est choisie, cible tactile de 44 px.
class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: true,
    child: Material(
      color: selected ? Palette.ink : Palette.surface,
      shape: StadiumBorder(side: BorderSide(color: selected ? Palette.ink : Palette.line)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w600, color: selected ? Palette.paper : Palette.ink),
          ),
        ),
      ),
    ),
  );
}

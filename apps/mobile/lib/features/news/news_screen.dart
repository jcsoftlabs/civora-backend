import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
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
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;
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

    final feed = <Widget>[
      if (widget.only == null)
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final (k, label) in filters)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _Pill(label: label, selected: _kind == k, onTap: () => setState(() => _kind = k)),
                ),
            ],
          ),
        ),
      const SizedBox(height: Space.m),
      Remote(
        path,
        skeleton: const Column(children: [Skeleton(height: 90), SizedBox(height: 24), Skeleton(height: 90)]),
        builder: (l) {
          final items = (l.data['items'] as List).cast<Map>();
          if (items.isEmpty) return Text(t.newsEmpty, style: Txt.body.copyWith(color: Palette.ink2));
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (l.offline)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.m),
                  child: OfflineBanner(text: t.offline),
                ),
              for (final (i, p) in items.indexed)
                Padding(
                  // Notes décalées et inclinées, jamais deux fois de la même façon : le tableau du local.
                  padding: EdgeInsets.fromLTRB(i.isEven ? 0 : 14, Space.s, i.isEven ? 14 : 0, Space.l),
                  child: Transform.rotate(angle: _tilts[i % _tilts.length], child: _pinned(context, t, locale, p, i)),
                ),
            ],
          );
        },
      ),
    ];

    if (widget.standalone) {
      return Scaffold(
        backgroundColor: Palette.board,
        appBar: AppBar(backgroundColor: Palette.board, title: Text(title)),
        body: ListView(padding: const EdgeInsets.fromLTRB(Space.gutter, Space.s, Space.gutter, 60), children: feed),
      );
    }
    return BannerPage(
      brand: parseHex(party?['brandColor'] as String?),
      sheetColor: Palette.board,
      title: title,
      message: party == null ? null : t.newsLead(party['name'] as String),
      children: feed,
    );
  }

  /// Chaque publication épinglée au tableau : texte en note de papier, podcast et album sur une feuille blanche.
  Widget _pinned(BuildContext context, L t, Locale locale, Map p, int i) {
    if (p['kind'] != 'podcast' && p['kind'] != 'album') {
      final lang = locale.languageCode;
      final when = p['publishedAt'] is String ? formatDay(DateTime.parse(p['publishedAt'] as String), lang) : null;
      final body = tr(p['body'], locale);
      final author = p['author'] as String?;
      return PinnedNote(
        label: p['kind'] == 'announcement' ? t.sectionAnnouncement : t.newsNews,
        title: tr(p['title'], locale),
        body: body.isEmpty ? null : body.replaceAll(RegExp(r'\s*\n+\s*'), ' '),
        // Texte long : la note en montre le début, l'article entier s'ouvre d'un toucher.
        more: body.length > 180 || '\n'.allMatches(body).length > 2 ? t.newsReadMore : null,
        onTap: () => context.push('/article', extra: p),
        footnote: author != null && when != null ? t.newsByline(when, author) : (when ?? author),
        color: p['kind'] == 'announcement' ? Palette.cream : Palette.surface,
        tapeAt: i.isEven ? 0.3 : 0.7,
      );
    }
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Palette.surface,
          child: Padding(padding: const EdgeInsets.fromLTRB(16, 20, 16, 14), child: _item(context, t, locale, p)),
        ),
        Positioned(
          top: -7,
          left: 0,
          right: 0,
          child: Align(
            alignment: Alignment(i.isEven ? -0.4 : 0.4, 0),
            child: Transform.rotate(
              angle: -0.06,
              child: Container(width: 46, height: 16, color: Palette.accent.withValues(alpha: 0.72)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _item(BuildContext context, L t, Locale locale, Map p) {
    final lang = locale.languageCode;
    final when = p['publishedAt'] is String ? formatDay(DateTime.parse(p['publishedAt'] as String), lang) : '';
    final media = ((p['media'] as List?) ?? const []).cast<Map>();
    final kindLabel = switch (p['kind']) {
      'announcement' => t.sectionAnnouncement,
      'podcast' => t.newsPodcast,
      'album' => t.newsAlbum,
      _ => t.newsNews,
    };
    final body = tr(p['body'], locale);
    final header = <Widget>[
      Text(tr(p['title'], locale), style: Txt.heading),
      const SizedBox(height: Space.xs),
      Text(t.kindDate(kindLabel, when), style: Txt.small),
    ];
    switch (p['kind']) {
      case 'podcast':
        final audio = media.where((m) => (m['mimeType'] as String? ?? '').startsWith('audio/')).firstOrNull;
        return PodcastCard(id: p['id'] as String, header: header, body: body, audioUrl: audio?['url'] as String?);
      case 'album':
        final images = media.where((m) => (m['mimeType'] as String? ?? '').startsWith('image/')).toList();
        return AlbumCard(
          header: header,
          images: [for (final m in images) m['url'] as String],
          onTap: images.isEmpty ? null : () => context.push('/album', extra: (tr(p['title'], locale), images)),
        );
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...header,
            if (body.isNotEmpty) ...[
              const SizedBox(height: Space.s),
              Text(body, maxLines: 4, overflow: TextOverflow.ellipsis, style: Txt.body),
            ],
          ],
        );
    }
  }
}

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

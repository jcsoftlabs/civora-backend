import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../core/state.dart';

/// Article ou annonce en entier, ouvert depuis le tableau des Actualités : une feuille de papier droite, lisible,
/// tenue par un ruban ambre ; genre, titre, date et auteur, images de l'article, puis le texte complet.
class ArticleScreen extends StatelessWidget {
  const ArticleScreen({super.key, required this.item});
  final Map item;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final when = item['publishedAt'] is String
        ? formatDay(DateTime.parse(item['publishedAt'] as String), locale.languageCode)
        : null;
    final author = item['author'] as String?;
    final body = tr(item['body'], locale);
    final images = ((item['media'] as List?) ?? const [])
        .cast<Map>()
        .where((m) => (m['mimeType'] as String? ?? '').startsWith('image/'))
        .toList();
    final announcement = item['kind'] == 'announcement';

    return Scaffold(
      backgroundColor: Palette.board,
      appBar: AppBar(backgroundColor: Palette.board, title: Text(announcement ? t.sectionAnnouncement : t.newsArticle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, Space.l, Space.gutter, 60),
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                color: announcement ? Palette.cream : Palette.surface,
                padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      announcement ? t.sectionAnnouncement : t.newsNews,
                      style: Txt.small.copyWith(color: Palette.ink2),
                    ),
                    const SizedBox(height: Space.xs),
                    Text(tr(item['title'], locale), style: Txt.title),
                    if (when != null || author != null) ...[
                      const SizedBox(height: Space.s),
                      Text(
                        author != null && when != null ? t.newsByline(when, author) : (when ?? author!),
                        style: Txt.small.copyWith(color: Palette.ink2),
                      ),
                    ],
                    for (final m in images) ...[
                      const SizedBox(height: Space.m),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: Image.network(
                          m['url'] as String,
                          fit: BoxFit.cover,
                          cacheWidth: 1080,
                          errorBuilder: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
                    ],
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: Space.m),
                      SelectableText(body, style: Txt.body.copyWith(fontSize: 17, height: 1.6)),
                    ],
                  ],
                ),
              ),
              Positioned(
                top: -8,
                left: 0,
                right: 0,
                child: Align(
                  alignment: const Alignment(-0.5, 0),
                  child: Transform.rotate(
                    angle: -0.05,
                    child: Container(width: 64, height: 18, color: Palette.accent.withValues(alpha: 0.72)),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

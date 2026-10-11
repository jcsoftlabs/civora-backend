import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import 'common.dart';

/// Section en tableau d'affichage : annonces, rassemblements et formations épinglés avec du ruban, comme au
/// panneau du local. Chaque note penche un peu, jamais deux fois de la même façon.
class SectionScreen extends ConsumerWidget {
  const SectionScreen({super.key});

  static const _tilts = [-0.03, 0.025, -0.015, 0.03, -0.025, 0.012];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final me = ref.watch(apiGet('/auth/me')).value;
    final feed = ref.watch(apiGet('/feed'));
    final events = ref.watch(apiGet('/events'));
    final training = ref.watch(apiGet('/training'));
    final brand = parseHex((me?.data['party'] as Map?)?['brandColor'] as String?);

    final notes = <Widget>[];
    for (final e in ((events.value?.data['events'] as List?) ?? const []).cast<Map>().take(3)) {
      notes.add(PinnedNote(
        label: t.sectionEvent,
        title: tr(e['title'], locale),
        footnote: [formatDayTime(DateTime.parse(e['startsAt'] as String), locale.languageCode), e['address']]
            .whereType<String>()
            .join(' · '),
      ));
    }
    for (final p in ((feed.value?.data['items'] as List?) ?? const []).cast<Map>()) {
      notes.add(PinnedNote(
        label: p['kind'] == 'announcement' ? t.sectionAnnouncement : t.sectionEditorial,
        title: tr(p['title'], locale),
        body: tr(p['body'], locale),
        footnote: p['publishedAt'] is String ? formatDay(DateTime.parse(p['publishedAt'] as String), locale.languageCode) : null,
        color: p['kind'] == 'announcement' ? Palette.cream : Palette.surface,
      ));
    }
    for (final c in ((training.value?.data['courses'] as List?) ?? const []).cast<Map>()) {
      notes.add(PinnedNote(
        label: t.sectionTraining,
        title: tr(c['title'], locale),
        footnote: t.sectionModules(c['passedModules'] as int? ?? 0, c['moduleCount'] as int? ?? 0),
        color: brand,
        onColor: onColor(brand),
      ));
    }
    final loading = feed.isLoading && events.isLoading;

    return ColoredBox(
      color: Palette.board,
      child: ListView(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        children: [
          TabHeader(eyebrow: (me?.data['party'] as Map?)?['name'] as String? ?? '', title: t.sectionTitle),
          const SizedBox(height: 16),
          if (loading)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 22),
              child: Column(children: [Skeleton(height: 120), SizedBox(height: 16), Skeleton(height: 90)]),
            )
          else if (notes.isEmpty)
            Padding(
              padding: const EdgeInsets.all(22),
              child: Text(t.sectionEmpty, style: const TextStyle(color: Palette.ink2, height: 1.45)),
            )
          else
            for (final (i, n) in notes.indexed)
              Padding(
                // Décalage alterné : les notes ne sont pas alignées au cordeau.
                padding: EdgeInsets.fromLTRB(i.isEven ? 20 : 38, 14, i.isEven ? 38 : 20, 10),
                child: Transform.rotate(angle: _tilts[i % _tilts.length], child: n),
              ),
          bottomSpace,
        ],
      ),
    );
  }
}

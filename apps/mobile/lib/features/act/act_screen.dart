import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/module_icons.dart';

/// Agir : tous les modules du membre, en une liste d'actions ; l'état à droite, en couleur seulement quand il
/// faut agir. Un module hors de la formule de l'organisation (réponse 402 de l'API) n'apparaît pas.
class ActScreen extends ConsumerWidget {
  const ActScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;

    AsyncValue<Loaded> probe(String p) => ref.watch(apiGet(p));
    bool hidden(AsyncValue<Loaded> v) => v.error is ApiError && (v.error! as ApiError).status == 402;
    List<Map> list(AsyncValue<Loaded> v, String key) => ((v.value?.data[key] as List?) ?? const []).cast<Map>();

    final votes = probe('/votes');
    final training = probe('/training');
    final events = probe('/events');
    final dues = probe('/members/me/dues');
    final podcasts = probe('/feed?kind=podcast&limit=50');
    final albums = probe('/feed?kind=album&limit=50');
    final referrals = probe('/members/me/referrals');

    final openVotes = list(votes, 'elections').where((e) => e['phase'] == 'open' && e['voted'] != true).length;
    final outstanding = ((dues.value?.data['outstanding'] as Map?) ?? const {}).entries
        .map((e) => formatAmount('${e.value}', '${e.key}'))
        .join(', ');
    final courses = list(training, 'courses');
    final passed = courses.fold<int>(0, (a, c) => a + ((c['passedModules'] as int?) ?? 0));
    final modules = courses.fold<int>(0, (a, c) => a + ((c['moduleCount'] as int?) ?? 0));
    final waiting = openVotes + (outstanding.isEmpty ? 0 : 1);

    return BannerPage(
      brand: parseHex(party?['brandColor'] as String?),
      title: t.actTitle,
      message: votes.hasValue && dues.hasValue ? t.waiting(waiting) : null,
      children: [
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          padding: const EdgeInsets.only(top: Space.s),
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 4,
          childAspectRatio: 0.72,
          children: [
            for (final (i, m) in [
              if (!hidden(votes))
                (
                  ModuleKind.votes,
                  t.actVotes,
                  votes.hasValue ? t.actVotesOpen(openVotes) : null,
                  openVotes > 0 ? Palette.inkBlue : null,
                  openVotes,
                  '/votes',
                ),
              if (!hidden(training))
                (
                  ModuleKind.training,
                  t.actTraining,
                  training.hasValue ? t.sectionModules(passed, modules) : null,
                  null,
                  0,
                  '/formations',
                ),
              if (!hidden(events))
                (
                  ModuleKind.events,
                  t.actEvents,
                  events.hasValue ? t.actEventsState(list(events, 'events').length) : null,
                  null,
                  0,
                  '/rassemblements',
                ),
              if (!hidden(dues))
                (
                  ModuleKind.dues,
                  t.actDues,
                  dues.hasValue ? (outstanding.isEmpty ? t.actDuesUpToDate : outstanding) : null,
                  outstanding.isEmpty ? null : Palette.warning,
                  0,
                  '/cotisations',
                ),
              if (!hidden(podcasts)) (ModuleKind.podcasts, t.actPodcasts, t.actListen, null, 0, '/podcasts'),
              if (!hidden(albums)) (ModuleKind.albums, t.actAlbums, t.actSee, null, 0, '/albums'),
              if (referrals.value?.data['enabled'] == true)
                (ModuleKind.referral, t.actReferral, referrals.value!.data['code'] as String?, null, 0, '/parrainage'),
            ].indexed)
              ModuleSticker(
                kind: m.$1,
                label: m.$2,
                state: m.$3,
                stateColor: m.$4,
                count: m.$5,
                tilt: const [-0.06, 0.05, -0.03, 0.07, -0.05, 0.03, -0.07][i % 7],
                onTap: () => context.push(m.$6),
              ),
          ],
        ),
      ],
    );
  }
}

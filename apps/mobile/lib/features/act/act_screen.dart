import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

/// Agir : tous les modules du membre au même endroit, chacun avec son état. Un module hors de la formule de
/// l'organisation (réponse 402 de l'API) n'apparaît pas.
class ActScreen extends ConsumerWidget {
  const ActScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final party = (ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?)?['name'] as String? ?? '';

    AsyncValue<Loaded> probe(String p) => ref.watch(apiGet(p));
    bool hidden(AsyncValue<Loaded> v) => v.error is ApiError && (v.error! as ApiError).status == 402;

    final votes = probe('/votes');
    final training = probe('/training');
    final events = probe('/events');
    final dues = probe('/members/me/dues');
    final podcasts = probe('/feed?kind=podcast&limit=50');
    final albums = probe('/feed?kind=album&limit=50');

    int count(AsyncValue<Loaded> v, String key, [bool Function(Map)? where]) =>
        ((v.value?.data[key] as List?) ?? const []).cast<Map>().where(where ?? (_) => true).length;

    final openVotes = count(votes, 'elections', (e) => e['phase'] == 'open' && e['voted'] != true);
    final tiles = <_Tile>[
      if (!hidden(votes))
        _Tile(
          icon: Icons.how_to_vote_outlined,
          title: t.actVotes,
          state: votes.hasValue ? t.actVotesOpen(openVotes) : null,
          badge: openVotes,
          route: '/votes',
        ),
      if (!hidden(training))
        _Tile(
          icon: Icons.school_outlined,
          title: t.actTraining,
          state: training.hasValue ? t.actTrainingState(count(training, 'courses')) : null,
          route: '/formations',
        ),
      if (!hidden(events))
        _Tile(
          icon: Icons.confirmation_number_outlined,
          title: t.actEvents,
          state: events.hasValue ? t.actEventsState(count(events, 'events')) : null,
          route: '/rassemblements',
        ),
      if (!hidden(dues))
        _Tile(
          icon: Icons.payments_outlined,
          title: t.actDues,
          state: dues.hasValue ? (dues.value!.data['upToDate'] == true ? t.actDuesUpToDate : t.actDuesLate) : null,
          warn: dues.hasValue && dues.value!.data['upToDate'] != true,
          route: '/cotisations',
        ),
      if (!hidden(podcasts))
        _Tile(
          icon: Icons.mic_none,
          title: t.actPodcasts,
          state: podcasts.hasValue ? t.actListen : null,
          route: '/podcasts',
        ),
      if (!hidden(albums))
        _Tile(
          icon: Icons.photo_library_outlined,
          title: t.actAlbums,
          state: albums.hasValue ? t.actSee : null,
          route: '/albums',
        ),
    ];

    return ListView(
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      children: [
        TabHeader(eyebrow: party, title: t.actTitle),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.05,
            children: tiles,
          ),
        ),
        bottomSpace,
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.state,
    required this.route,
    this.badge = 0,
    this.warn = false,
  });
  final IconData icon;
  final String title;
  final String? state;
  final String route;
  final int badge;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final brand = Theme.of(context).colorScheme.primary;
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Palette.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(route),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: brand.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: brand, size: 26),
                  ),
                  const Spacer(),
                  if (badge > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(color: Palette.accent, borderRadius: BorderRadius.circular(20)),
                      child: Text('$badge', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    ),
                ],
              ),
              const Spacer(),
              Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              state == null
                  ? const Skeleton(height: 14, width: 80, radius: 6)
                  : Text(
                      state!,
                      style: TextStyle(
                        fontSize: 13,
                        color: warn ? Palette.warning : Palette.ink2,
                        fontWeight: warn ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

String phaseLabel(L t, String phase) => switch (phase) {
  'preparation' => t.votePhasePreparation,
  'open' => t.votePhaseOpen,
  'counting' => t.votePhaseCounting,
  'closed' => t.votePhaseClosed,
  _ => t.votePhasePublished,
};

/// Scrutins où le membre est inscrit (VOT-03) : ouverts d'abord, puis à venir, puis passés.
class VotesScreen extends ConsumerWidget {
  const VotesScreen({super.key});

  static const _order = {'open': 0, 'preparation': 1, 'counting': 2, 'closed': 3, 'published': 4};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.votesTitle)),
      body: Remote(
        '/votes',
        skeleton: const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 110)),
        builder: (l) {
          final list = (l.data['elections'] as List).cast<Map>().toList()
            ..sort((a, b) => (_order[a['phase']] ?? 9).compareTo(_order[b['phase']] ?? 9));
          if (list.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(22),
              child: Text(t.votesEmpty, style: const TextStyle(color: Palette.ink2)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 40),
            children: [
              for (final (i, v) in list.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: BallotSlip(
                    label: [
                      phaseLabel(t, v['phase'] as String),
                      if (v['round'] == 2) t.voteRound2,
                      v['phase'] == 'preparation'
                          ? t.ballotOpens(formatDayTime(DateTime.parse(v['opensAt'] as String), locale.languageCode))
                          : t.ballotCloses(formatDayTime(DateTime.parse(v['closesAt'] as String), locale.languageCode)),
                    ].join(' · '),
                    title: tr(v['title'], locale),
                    options: const [],
                    action: v['phase'] == 'open' ? (v['voted'] == true ? t.ballotVoted : t.ballotVote) : null,
                    tilt: i.isEven ? -0.01 : 0.008,
                    onTap: () => context.push('/votes/${v['id']}'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

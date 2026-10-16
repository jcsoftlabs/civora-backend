import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/member_card.dart';
import '../../widgets/module_icons.dart';
import '../../widgets/objects.dart';
import 'common.dart';

/// Accueil : la banderole salue le membre et dit ce qui l'attend ; sa carte de membre se pose à cheval sur la
/// banderole et la feuille (seul objet fort de l'écran) ; dessous, la liste nue de ce qu'il a à faire, puis ses
/// points et ses filleuls.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final lang = locale.languageCode;
    final me = ref.watch(apiGet('/auth/me')).value;
    final card = ref.watch(apiGet('/members/me/card')).value;
    final dues = ref.watch(apiGet('/members/me/dues')).value;
    final votes = ref.watch(apiGet('/votes')).value;
    final events = ref.watch(apiGet('/events')).value;
    final points = ref.watch(apiGet('/members/me/points')).value;
    final referrals = ref.watch(apiGet('/members/me/referrals')).value;
    final offline = [me, dues, votes, events].any((x) => x?.offline ?? false);

    final member = me?.data['member'] as Map?;
    final party = me?.data['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    final upToDate = dues?.data['upToDate'] == true;
    final look = cardDesign(ref, t, locale, since: (card?.data['member'] as Map?)?['since'] as String?);
    final outstanding = ((dues?.data['outstanding'] as Map?) ?? const {}).entries
        .map((e) => formatAmount('${e.value}', '${e.key}'))
        .join(', ');

    final todos = <Widget>[];
    final ballots = <Widget>[];
    for (final v in ((votes?.data['elections'] as List?) ?? const []).cast<Map>()) {
      if (v['phase'] != 'open' || v['voted'] == true) continue;
      ballots.add(
        Padding(
          padding: const EdgeInsets.only(bottom: Space.m),
          child: BallotSlip(
            label: t.ballotCloses(formatDayTime(DateTime.parse(v['closesAt'] as String), lang)),
            title: tr(v['title'], locale),
            options: v['kind'] == 'question' ? [t.yes, t.no] : const [],
            action: t.ballotVote,
            tilt: ballots.length.isEven ? -0.012 : 0.01,
            onTap: () => context.push('/votes/${v['id']}'),
          ),
        ),
      );
    }
    if (dues != null && !upToDate && outstanding.isNotEmpty) {
      todos.add(
        ActionRow(
          icon: Icons.payments_outlined,
          title: t.duesDue,
          state: outstanding,
          stateColor: Palette.warning,
          onTap: () => context.push('/cotisations'),
        ),
      );
    }
    final next = ((events?.data['events'] as List?) ?? const []).cast<Map>().firstOrNull;
    final pointsOn = points?.data['enabled'] == true;
    final referralOn = referrals?.data['enabled'] == true;
    // Un module hors de la formule (402) n'a pas de raccourci.
    bool on(String path) {
      final e = ref.watch(apiGet(path)).error;
      return !(e is ApiError && e.status == 402);
    }

    return BannerPage(
      brand: brand,
      title: t.helloTitle(member?['firstName'] as String? ?? ''),
      message: votes == null || dues == null ? null : t.waiting(todos.length + ballots.length),
      objectScale: 0.76,
      object: me == null
          ? const AspectRatio(aspectRatio: 1.586, child: Skeleton(radius: 18))
          : Semantics(
              button: true,
              label: t.navScan,
              child: GestureDetector(
                onTap: () => context.push('/carte'),
                child: MemberCard(
                  brand: brand,
                  secondary: party?['brandColorSecondary'] == null
                      ? null
                      : parseHex(party!['brandColorSecondary'] as String),
                  partyName: party?['name'] as String? ?? '',
                  name: '${member?['firstName']} ${member?['lastName']}',
                  number: member?['number'] as String? ?? '',
                  numberLabel: t.cardNumber,
                  location: (card?.data['member'] as Map?)?['location'] as String?,
                  year: upToDate ? '${haitiYear()}' : null,
                  tilt: -0.03,
                  style: look.style,
                  photoUrl: look.photoUrl,
                  details: look.details,
                ),
              ),
            ),
      children: [
        if (offline)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.m),
            child: OfflineBanner(text: t.offline),
          ),
        if (votes == null || dues == null)
          const Skeleton(height: 72)
        else ...[
          ...ballots,
          ...todos,
          if (next != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.m),
              child: TicketCard(
                label: t.ticketLabel,
                title: tr(next['title'], locale),
                place: next['address'] as String?,
                when: formatDayTime(DateTime.parse(next['startsAt'] as String), lang),
                footnote: next['isRegistered'] == true
                    ? t.ticketRegistered
                    : next['placesLeft'] is int
                    ? t.ticketPlaces(next['placesLeft'] as int)
                    : null,
                onTap: () => context.push('/rassemblements'),
              ),
            ),
          if (todos.isEmpty && ballots.isEmpty && next == null)
            Text(t.todoNone, style: Txt.body.copyWith(color: Palette.ink2)),
        ],
        SheetHeading(t.shortcutsTitle),
        _Shortcuts(
          items: [
            (ModuleKind.card, t.shortcutCard, '/carte'),
            (ModuleKind.profile, t.shortcutProfile, '/fiche'),
            if (on('/training')) (ModuleKind.training, t.actTraining, '/formations'),
            if (on('/events')) (ModuleKind.events, t.actEvents, '/rassemblements'),
            if (on('/members/me/dues')) (ModuleKind.dues, t.actDues, '/cotisations'),
            if (on('/votes')) (ModuleKind.votes, t.actVotes, '/votes'),
            if (referralOn) (ModuleKind.referral, t.actReferral, '/parrainage'),
            if (on('/feed?kind=podcast&limit=50')) (ModuleKind.podcasts, t.actPodcasts, '/podcasts'),
          ],
        ),
        if (pointsOn || referralOn) ...[
          const SizedBox(height: Space.xl),
          Row(
            children: [
              if (pointsOn)
                Expanded(
                  child: Figure(value: '${points!.data['total']}', label: t.statPoints),
                ),
              if (referralOn)
                Expanded(
                  child: Figure(
                    value: '${((referrals!.data['referrals'] as List?) ?? const []).length}',
                    label: t.statReferrals,
                  ),
                ),
              const Spacer(),
            ],
          ),
        ],
      ],
    );
  }
}

/// Raccourcis de l'accueil : les mêmes pastilles que l'onglet Agir (objets dessinés, posés de travers), en plus
/// petit et sur quatre colonnes.
class _Shortcuts extends StatelessWidget {
  const _Shortcuts({required this.items});
  final List<(ModuleKind, String, String)> items;

  @override
  Widget build(BuildContext context) => GridView.count(
    crossAxisCount: 4,
    shrinkWrap: true,
    padding: EdgeInsets.zero,
    physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 4,
    crossAxisSpacing: 2,
    childAspectRatio: 0.8,
    children: [
      for (final (i, (kind, label, path)) in items.indexed)
        ModuleSticker(
          kind: kind,
          label: label,
          size: 64,
          tilt: const [-0.06, 0.05, -0.03, 0.07, -0.05, 0.03, -0.07, 0.04][i % 8],
          onTap: () => context.push(path),
        ),
    ],
  );
}

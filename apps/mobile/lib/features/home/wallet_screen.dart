import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/member_card.dart';
import '../../widgets/objects.dart';
import 'common.dart';

/// Accueil : la carte de membre, puis seulement ce qui attend le membre (bulletin à déposer, cotisation à
/// régler, prochain rassemblement). Tout le reste vit dans Agir et Actualités.
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
    final offline = [me, dues, votes, events].any((x) => x?.offline ?? false);

    final member = me?.data['member'] as Map?;
    final party = me?.data['party'] as Map?;
    final upToDate = dues?.data['upToDate'] == true;
    final outstanding = ((dues?.data['outstanding'] as Map?) ?? const {}).entries
        .map((e) => formatAmount('${e.value}', '${e.key}'))
        .join(', ');

    final todos = <Widget>[];
    for (final v in ((votes?.data['elections'] as List?) ?? const []).cast<Map>()) {
      if (v['phase'] != 'open' || v['voted'] == true) continue;
      todos.add(
        _Todo(
          icon: Icons.how_to_vote_outlined,
          title: t.todoVote(tr(v['title'], locale)),
          detail: t.ballotCloses(formatDayTime(DateTime.parse(v['closesAt'] as String), lang)),
          accent: Palette.inkBlue,
          onTap: () => context.push('/votes/${v['id']}'),
        ),
      );
    }
    if (dues != null && !upToDate && outstanding.isNotEmpty) {
      todos.add(
        _Todo(
          icon: Icons.payments_outlined,
          title: t.todoDues(outstanding),
          detail: t.duesPayHint,
          accent: Palette.warning,
          onTap: () => context.push('/cotisations'),
        ),
      );
    }
    final next = ((events?.data['events'] as List?) ?? const []).cast<Map>().firstOrNull;

    return ListView(
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      children: [
        TabHeader(eyebrow: party?['name'] as String? ?? '', title: t.hello(member?['firstName'] as String? ?? '')),
        if (offline)
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 0),
            child: OfflineBanner(text: t.offline),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
          child: me == null
              ? const AspectRatio(aspectRatio: 1.586, child: Skeleton(radius: 18))
              : Semantics(
                  button: true,
                  label: t.navScan,
                  child: GestureDetector(
                    onTap: () => context.push('/carte'),
                    child: MemberCard(
                      brand: parseHex(party?['brandColor'] as String?),
                      secondary: party?['brandColorSecondary'] == null
                          ? null
                          : parseHex(party!['brandColorSecondary'] as String),
                      partyName: party?['name'] as String? ?? '',
                      name: '${member?['firstName']} ${member?['lastName']}',
                      number: member?['number'] as String? ?? '',
                      numberLabel: t.cardNumber,
                      location: (card?.data['member'] as Map?)?['location'] as String?,
                      year: upToDate ? '${haitiYear()}' : null,
                    ),
                  ),
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 30, 22, 10),
          child: Text(t.todoTitle, style: Theme.of(context).textTheme.titleMedium),
        ),
        if (votes == null || dues == null)
          const Padding(padding: EdgeInsets.symmetric(horizontal: 22), child: Skeleton(height: 72))
        else if (todos.isEmpty && next == null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Text(t.todoNone, style: const TextStyle(color: Palette.ink2, height: 1.45)),
          )
        else ...[
          for (final w in todos) Padding(padding: const EdgeInsets.fromLTRB(22, 0, 22, 10), child: w),
          if (next != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 6, 22, 0),
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
        ],
        bottomSpace,
      ],
    );
  }
}

/// Une chose à faire : icône teintée, titre, précision, flèche.
class _Todo extends StatelessWidget {
  const _Todo({required this.icon, required this.title, required this.detail, required this.accent, this.onTap});
  final IconData icon;
  final String title;
  final String detail;
  final Color accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Palette.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: const BorderSide(color: Palette.line),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(icon, color: accent),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 1.3)),
                  const SizedBox(height: 2),
                  Text(detail, style: const TextStyle(fontSize: 13, color: Palette.ink2, height: 1.35)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Palette.ink2),
          ],
        ),
      ),
    ),
  );
}

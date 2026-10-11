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

/// Accueil en portefeuille : seulement ce qui demande une action. La carte (et sa cotisation), le prochain
/// rassemblement en billet, les bulletins à déposer ou à venir.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final me = ref.watch(apiGet('/auth/me')).value;
    final dues = ref.watch(apiGet('/members/me/dues')).value;
    final offline = [me, dues].any((x) => x?.offline ?? false);

    final first = (me?.data['member'] as Map?)?['firstName'] as String? ?? '';
    final party = me?.data['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    final upToDate = dues?.data['upToDate'] == true;
    final outstanding = (dues?.data['outstanding'] as Map?)?.entries.map((e) => formatAmount('${e.value}', '${e.key}')).join(', ');

    return ListView(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        children: [
          TabHeader(eyebrow: party?['name'] as String? ?? '', title: t.hello(first)),
          if (offline) Padding(padding: const EdgeInsets.fromLTRB(22, 8, 22, 0), child: OfflineBanner(text: t.offline)),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 20, 22, 0),
            child: me == null
                ? const Skeleton(height: 210, radius: 18)
                : Semantics(
                    button: true,
                    label: t.navScan,
                    child: GestureDetector(
                      onTap: () => context.push('/carte'),
                      child: MemberCard(
                        brand: brand,
                        partyName: party?['name'] as String? ?? '',
                        name: '${me.data['member']['firstName']} ${me.data['member']['lastName']}',
                        number: me.data['member']['number'] as String,
                        memberLabel: t.cardMember,
                        badge: upToDate ? t.duesPaid('${haitiYear()}') : null,
                      ),
                    ),
                  ),
          ),
          if (dues != null && !upToDate && outstanding != null && outstanding.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 16, 22, 0),
              child: _DuesStrip(text: t.duesAmount(outstanding), label: t.duesDue),
            ),
          const SizedBox(height: 22),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Remote(
              '/events',
              skeleton: const Skeleton(height: 92),
              builder: (l) {
                final events = (l.data['events'] as List).cast<Map>();
                if (events.isEmpty) return const SizedBox.shrink();
                final e = events.first;
                final starts = DateTime.parse(e['startsAt'] as String);
                return TicketCard(
                  label: t.ticketLabel,
                  title: tr(e['title'], locale),
                  place: e['address'] as String?,
                  when: formatDayTime(starts, locale.languageCode),
                  footnote: e['isRegistered'] == true
                      ? t.ticketRegistered
                      : e['placesLeft'] is int
                          ? t.ticketPlaces(e['placesLeft'] as int)
                          : null,
                );
              },
            ),
          ),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Remote(
              '/votes',
              skeleton: const Skeleton(height: 110),
              builder: (l) {
                final votes = (l.data['elections'] as List).cast<Map>().where(
                      (v) => v['phase'] == 'open' || v['phase'] == 'preparation',
                    );
                if (votes.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(t.walletEmpty, style: TextStyle(color: Palette.ink2, height: 1.45)),
                  );
                }
                return Column(
                  children: [
                    for (final (i, v) in votes.indexed)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: _ballot(t, locale, v, i),
                      ),
                  ],
                );
              },
            ),
          ),
          bottomSpace,
        ],
    );
  }

  Widget _ballot(L t, Locale locale, Map v, int i) {
    final open = v['phase'] == 'open';
    final voted = v['voted'] == true;
    final closes = DateTime.parse(v['closesAt'] as String);
    final opens = DateTime.parse(v['opensAt'] as String);
    return BallotSlip(
      label: open
          ? '${t.ballotOpen} · ${t.ballotCloses(formatDay(closes, locale.languageCode))}'
          : t.ballotOpens(formatDayTime(opens, locale.languageCode)),
      title: tr(v['title'], locale),
      options: v['kind'] == 'question' ? [t.yes, t.no] : const [],
      action: open ? (voted ? t.ballotVoted : t.ballotVote) : null,
      tilt: i.isEven ? -0.012 : 0.01,
    );
  }
}

/// Cotisation à régler : bande ambre sous la carte.
class _DuesStrip extends StatelessWidget {
  const _DuesStrip({required this.text, required this.label});
  final String text;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Palette.accent.withValues(alpha: 0.18),
          border: Border.all(color: Palette.accent),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(Icons.payments_outlined, color: Palette.ink),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 12, color: Palette.ink2)),
                  Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                ],
              ),
            ),
          ],
        ),
      );
}

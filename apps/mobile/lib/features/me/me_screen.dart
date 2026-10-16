import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/objects.dart';
import 'photo.dart';

/// Moi : la photo et le nom du membre dans la banderole ; dessous, ses points et ses filleuls, son code de
/// parrainage à partager, ses derniers points, son carnet (cotisations de l'année, tampons), puis les réglages.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final me = ref.watch(apiGet('/auth/me')).value?.data;
    final profile = ref.watch(apiGet('/members/me')).value?.data;
    final points = ref.watch(apiGet('/members/me/points')).value?.data;
    final referrals = ref.watch(apiGet('/members/me/referrals')).value?.data;
    final votes = ref.watch(apiGet('/votes')).value?.data;
    final member = me?['member'] as Map?;
    final party = me?['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    final status = tr(profile?['statusLabel'], locale);
    final number = member?['number'] as String? ?? '';
    final voted = ((votes?['elections'] as List?) ?? const []).cast<Map>().where((v) => v['voted'] == true).length;

    return BannerPage(
      brand: brand,
      leading: MemberPhoto(
        photoFileId: profile?['photoFileId'] as String?,
        initials: member == null
            ? ''
            : '${member['firstName']}'.characters.first + '${member['lastName']}'.characters.first,
        ring: onColor(brand),
      ),
      title: member == null ? '' : '${member['firstName']} ${member['lastName']}',
      message: status.isEmpty ? t.meNumber(number) : t.meStatus(status, number),
      children: [
        Row(
          children: [
            if (points?['enabled'] == true)
              Expanded(
                child: Figure(value: '${points!['total']}', label: t.statPoints),
              ),
            if (referrals?['enabled'] == true)
              Expanded(
                child: Figure(
                  value: '${((referrals!['referrals'] as List?) ?? const []).length}',
                  label: t.statReferrals,
                ),
              ),
            Expanded(
              child: Figure(value: '$voted', label: t.statVotes),
            ),
          ],
        ),
        const SizedBox(height: Space.l),
        OutlinedButton.icon(
          onPressed: () => context.push('/fiche'),
          icon: const Icon(Icons.badge_outlined),
          label: Text(t.profileOpen),
        ),
        if (referrals?['enabled'] == true) ReferralPanel(data: referrals!, partyName: party?['name'] as String? ?? ''),
        if (points?['enabled'] == true) PointsList(data: points!, limit: 4),
        const _Carnet(),
        const _Settings(),
      ],
    );
  }
}

/// Code de parrainage (ENG-01) en grand, avec Partager et Copier ; puis les filleuls et leur état.
class ReferralPanel extends StatelessWidget {
  const ReferralPanel({super.key, required this.data, required this.partyName});
  final Map<String, dynamic> data;
  final String partyName;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final code = data['code'] as String?;
    final url = data['shareUrl'] as String? ?? '';
    final list = ((data['referrals'] as List?) ?? const []).cast<Map>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SheetHeading(t.referralTitle),
        Text(t.referralLead, style: Txt.body.copyWith(color: Palette.ink2)),
        if (code != null) ...[
          const SizedBox(height: Space.m),
          Semantics(
            label: '${t.referralTitle} $code',
            excludeSemantics: true,
            child: Text(
              code,
              style: Txt.title.copyWith(letterSpacing: 3, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ),
          const SizedBox(height: Space.m),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () =>
                      SharePlus.instance.share(ShareParams(text: t.referralShareText(partyName, code, url))),
                  icon: const Icon(Icons.ios_share),
                  label: Text(t.referralShare),
                ),
              ),
              const SizedBox(width: Space.s),
              OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size(110, 52)),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: code));
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.referralCopied)));
                },
                child: Text(t.referralCopy),
              ),
            ],
          ),
        ],
        SheetHeading(t.referralsTitle),
        if (list.isEmpty)
          Text(t.referralNone, style: Txt.body.copyWith(color: Palette.ink2))
        else
          for (final r in list)
            ActionRow(
              title: r['name'] as String,
              detail: r['since'] is String
                  ? formatDay(DateTime.parse(r['since'] as String), Localizations.localeOf(context).languageCode)
                  : null,
              state: switch (r['state']) {
                'validated' => t.referralValidated,
                'rejected' => t.referralRejected,
                _ => t.referralPending,
              },
              stateColor: r['state'] == 'validated' ? Palette.success : null,
            ),
      ],
    );
  }
}

/// Journal des points (GAM-09) : l'action, sa date, les points gagnés ou retirés.
class PointsList extends StatelessWidget {
  const PointsList({super.key, required this.data, this.limit});
  final Map<String, dynamic> data;
  final int? limit;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final entries = ((data['entries'] as List?) ?? const []).cast<Map>();
    final shown = limit == null ? entries : entries.take(limit!).toList();
    String label(String a) => switch (a) {
      'referral' => t.pointsReferral,
      'training' => t.pointsTraining,
      'vote' => t.pointsVote,
      'dues' => t.pointsDues,
      'attendance' => t.pointsAttendance,
      _ => t.pointsManual,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SheetHeading(
          t.pointsTitle,
          trailing: limit != null && entries.length > limit!
              ? TextButton(onPressed: () => context.push('/points'), child: Text(t.pointsAll))
              : null,
        ),
        if (entries.isEmpty)
          Text(t.pointsNone, style: Txt.body.copyWith(color: Palette.ink2))
        else
          for (final e in shown)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e['note'] is String
                              ? '${label(e['action'] as String)} : ${e['note']}'
                              : label(e['action'] as String),
                          style: Txt.body.copyWith(fontWeight: FontWeight.w600),
                        ),
                        Text(formatDay(DateTime.parse(e['createdAt'] as String), lang), style: Txt.small),
                      ],
                    ),
                  ),
                  Text(
                    '${(e['points'] as int) > 0 ? '+' : ''}${e['points']}',
                    style: Txt.heading.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                      color: (e['points'] as int) < 0 ? Palette.danger : Palette.ink,
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

/// Carnet du militant : douze mois de cotisation (tamponnés une fois réglés), un tampon par vote et certificat.
class _Carnet extends ConsumerWidget {
  const _Carnet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final dues = ref.watch(apiGet('/members/me/dues')).value;
    final votes = ref.watch(apiGet('/votes')).value;
    final training = ref.watch(apiGet('/training')).value;
    final year = haitiYear();
    final months = List<String?>.filled(12, null);
    for (final o in ((dues?.data['obligations'] as List?) ?? const []).cast<Map>()) {
      final start = DateTime.tryParse(o['periodStart'] as String? ?? '');
      if (start == null || start.year != year) continue;
      months[start.month - 1] = o['paidAt'] != null ? 'paid' : (o['state'] as String? ?? 'due');
    }
    final stamps = <Widget>[
      for (final v in ((votes?.data['elections'] as List?) ?? const []).cast<Map>().where((v) => v['voted'] == true))
        Stamp(
          text: t.carnetVoted,
          date: formatDay(DateTime.parse(v['opensAt'] as String), locale.languageCode),
          color: Palette.inkBlue,
          angle: -0.08,
        ),
      for (final c in ((training?.data['courses'] as List?) ?? const []).cast<Map>().where(
        (c) => c['certificateNumber'] != null,
      ))
        Stamp(text: t.carnetCertified, date: tr(c['title'], locale), angle: 0.07),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SheetHeading(t.carnetDues('$year')),
        if (months.every((m) => m == null))
          Text(t.carnetDuesNone, style: Txt.body.copyWith(color: Palette.ink2))
        else
          GridView.count(
            crossAxisCount: 6,
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            children: [
              for (var i = 0; i < 12; i++) _Month(letter: monthInitial(i + 1, locale.languageCode), state: months[i]),
            ],
          ),
        if (stamps.isNotEmpty) ...[SheetHeading(t.carnetStamps), Wrap(spacing: 18, runSpacing: 18, children: stamps)],
      ],
    );
  }
}

class _Month extends StatelessWidget {
  const _Month({required this.letter, required this.state});
  final String letter;
  final String? state;

  @override
  Widget build(BuildContext context) {
    final brand = Theme.of(context).colorScheme.primary;
    final (color, filled) = switch (state) {
      'paid' => (brand, true),
      'late' => (Palette.danger, false),
      'due' => (Palette.warning, false),
      _ => (Palette.line, false),
    };
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? color : null,
        border: Border.all(color: color, width: filled ? 0 : 1.5),
      ),
      child: Text(
        letter,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: filled ? onColor(color) : (state == null ? Palette.ink2 : color),
        ),
      ),
    );
  }
}

/// Langue et déconnexion.
class _Settings extends ConsumerWidget {
  const _Settings();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = ref.watch(localeProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SheetHeading(t.profileLanguage),
        SegmentedButton<String>(
          expandedInsets: EdgeInsets.zero,
          segments: const [
            ButtonSegment(value: 'fr', label: Text('Français')),
            ButtonSegment(value: 'ht', label: Text('Kreyòl')),
          ],
          selected: {locale.languageCode},
          onSelectionChanged: (s) => ref.read(localeProvider.notifier).set(Locale(s.first)),
        ),
        const SizedBox(height: Space.xl),
        OutlinedButton.icon(
          onPressed: () => ref.read(sessionProvider.notifier).close(),
          icon: const Icon(Icons.logout),
          label: Text(t.profileLogout),
        ),
      ],
    );
  }
}

/// Historique complet des points.
class PointsScreen extends ConsumerWidget {
  const PointsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final data = ref.watch(apiGet('/members/me/points')).value?.data;
    return Scaffold(
      backgroundColor: Palette.paper,
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.pointsTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, 40),
        children: [
          if (data == null)
            const Skeleton(height: 200)
          else ...[
            Figure(value: '${data['total']}', label: t.statPoints),
            PointsList(data: data),
          ],
        ],
      ),
    );
  }
}

/// Parrainer (depuis Agir) : le code à partager et les filleuls.
class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final data = ref.watch(apiGet('/members/me/referrals')).value?.data;
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;
    return Scaffold(
      backgroundColor: Palette.paper,
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.actReferral)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, 40),
        children: [
          if (data == null)
            const Skeleton(height: 200)
          else
            ReferralPanel(data: data, partyName: party?['name'] as String? ?? ''),
        ],
      ),
    );
  }
}

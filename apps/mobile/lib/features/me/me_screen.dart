import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

/// Moi : le carnet du militant, mémoire du membre (douze cases de cotisation pour l'année, un tampon par vote
/// déposé et par formation certifiée), puis l'organisation, la langue et la déconnexion.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final me = ref.watch(apiGet('/auth/me')).value;
    final profile = ref.watch(apiGet('/members/me')).value;
    final dues = ref.watch(apiGet('/members/me/dues')).value;
    final votes = ref.watch(apiGet('/votes')).value;
    final training = ref.watch(apiGet('/training')).value;
    final year = haitiYear();
    final number = (me?.data['member'] as Map?)?['number'] as String? ?? '';

    // État de chaque mois de l'année : réglé, dû ou en retard, ou rien de prévu.
    final months = List<String?>.filled(12, null);
    for (final o in ((dues?.data['obligations'] as List?) ?? const []).cast<Map>()) {
      final start = DateTime.tryParse(o['periodStart'] as String? ?? '');
      if (start == null || start.year != year) continue;
      final s = o['paidAt'] != null ? 'paid' : (o['state'] as String? ?? 'due');
      months[start.month - 1] = s;
    }
    final stamps = <Widget>[];
    for (final v in ((votes?.data['elections'] as List?) ?? const []).cast<Map>().where((v) => v['voted'] == true)) {
      stamps.add(
        Stamp(
          text: t.carnetVoted,
          date: formatDay(DateTime.parse(v['opensAt'] as String), locale.languageCode),
          color: Palette.inkBlue,
          angle: stamps.length.isEven ? -0.1 : 0.08,
        ),
      );
    }
    for (final c in ((training?.data['courses'] as List?) ?? const []).cast<Map>()) {
      if (c['certificateNumber'] == null) continue;
      stamps.add(
        Stamp(text: t.carnetCertified, date: tr(c['title'], locale), angle: stamps.length.isEven ? 0.07 : -0.09),
      );
    }

    return ColoredBox(
      color: Palette.cream,
      child: ListView(
        padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
        children: [
          TabHeader(eyebrow: t.carnetNumber(number), title: t.meTitle),
          if (profile?.data['statusLabel'] != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 6, 22, 0),
              child: Text(
                t.carnetStatus(tr(profile!.data['statusLabel'], locale)),
                style: const TextStyle(color: Palette.ink2),
              ),
            ),
          _Page(
            title: t.carnetDues('$year'),
            child: dues == null
                ? const Skeleton(height: 110)
                : months.every((m) => m == null)
                ? Text(t.carnetDuesNone, style: const TextStyle(color: Palette.ink2))
                : GridView.count(
                    crossAxisCount: 6,
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    children: [
                      for (var i = 0; i < 12; i++)
                        _Month(letter: monthInitial(i + 1, locale.languageCode), state: months[i]),
                    ],
                  ),
          ),
          _Page(
            title: t.carnetStamps,
            child: stamps.isEmpty
                ? Text(t.carnetStampsNone, style: const TextStyle(color: Palette.ink2, height: 1.45))
                : Wrap(spacing: 18, runSpacing: 18, children: stamps),
          ),
          const _Settings(),
          bottomSpace,
        ],
      ),
    );
  }
}

/// Organisation, langue, déconnexion.
class _Settings extends ConsumerWidget {
  const _Settings();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final me = ref.watch(apiGet('/auth/me')).value?.data;
    final locale = ref.watch(localeProvider);
    final member = me?['member'] as Map?;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Page(
          title: t.profileTitle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                member == null ? '' : '${member['firstName']} ${member['lastName']}',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
              Text((me?['party'] as Map?)?['name'] as String? ?? '', style: const TextStyle(color: Palette.ink2)),
              const SizedBox(height: 16),
              Text(t.profileLanguage, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                expandedInsets: EdgeInsets.zero,
                segments: const [
                  ButtonSegment(value: 'fr', label: Text('Français')),
                  ButtonSegment(value: 'ht', label: Text('Kreyòl')),
                ],
                selected: {locale.languageCode},
                onSelectionChanged: (s) => ref.read(localeProvider.notifier).set(Locale(s.first)),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 16, 22, 0),
          child: OutlinedButton.icon(
            onPressed: () => ref.read(sessionProvider.notifier).close(),
            icon: const Icon(Icons.logout),
            label: Text(t.profileLogout),
          ),
        ),
      ],
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(22, 18, 22, 0),
    padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
    decoration: BoxDecoration(
      color: Palette.surface,
      border: Border.all(color: Palette.line),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 13, color: Palette.ink2, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 14),
        child,
      ],
    ),
  );
}

/// Case d'un mois : tampon plein si réglé, pointillé ambre si dû, rouge si en retard, vide sinon.
class _Month extends StatelessWidget {
  const _Month({required this.letter, required this.state});
  final String letter;
  final String? state;

  @override
  Widget build(BuildContext context) {
    final (color, filled) = switch (state) {
      'paid' => (Palette.primary, true),
      'late' => (Palette.danger, false),
      'due' => (Palette.warning, false),
      _ => (Palette.line, false),
    };
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? color.withValues(alpha: 0.12) : null,
        border: Border.all(color: color, width: filled ? 2 : 1.4),
      ),
      child: Text(
        letter,
        style: TextStyle(fontWeight: FontWeight.w600, color: state == null ? Palette.ink2 : color),
      ),
    );
  }
}

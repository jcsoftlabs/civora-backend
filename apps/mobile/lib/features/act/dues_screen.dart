import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

/// Relevé des cotisations du membre (FIN-03 à FIN-06) : échéances de l'année, réglées ou à régler.
class DuesScreen extends ConsumerWidget {
  const DuesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.duesTitle)),
      body: Remote(
        '/members/me/dues',
        skeleton: const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 200)),
        builder: (l) {
          final obligations = (l.data['obligations'] as List).cast<Map>().reversed.toList();
          final outstanding = ((l.data['outstanding'] as Map?) ?? const {}).entries
              .map((e) => formatAmount('${e.value}', '${e.key}'))
              .join(', ');
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 40),
            children: [
              if (outstanding.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Palette.accent.withValues(alpha: 0.18),
                    border: Border.all(color: Palette.accent),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t.duesAmount(outstanding),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 6),
                      Text(t.duesPayHint, style: const TextStyle(height: 1.45)),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
              ],
              if (obligations.isEmpty)
                Text(t.duesNone, style: const TextStyle(color: Palette.ink2))
              else
                Container(
                  decoration: BoxDecoration(
                    color: Palette.surface,
                    border: Border.all(color: Palette.line),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      for (final o in obligations)
                        ListTile(
                          title: Text(
                            formatAmount('${o['amount']}', '${o['currency']}'),
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            formatDay(DateTime.parse('${o['dueDate']}T12:00:00Z'), lang),
                            style: const TextStyle(color: Palette.ink2),
                          ),
                          trailing: _State(state: o['paidAt'] != null ? 'paid' : (o['state'] as String? ?? 'due')),
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _State extends StatelessWidget {
  const _State({required this.state});
  final String state;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final (label, color) = switch (state) {
      'paid' => (t.duesStatePaid, Palette.success),
      'late' => (t.duesStateLate, Palette.danger),
      'upcoming' => (t.duesStateUpcoming, Palette.ink2),
      _ => (t.duesStateDue, Palette.warning),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

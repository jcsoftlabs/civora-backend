import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'common.dart';

/// Profil : organisation, langue (français ou créole), déconnexion.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final me = ref.watch(apiGet('/auth/me')).value?.data;
    final locale = ref.watch(localeProvider);
    final member = me?['member'] as Map?;
    return ListView(
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      children: [
        TabHeader(
          eyebrow: member == null ? '' : '${member['firstName']} ${member['lastName']}',
          title: t.profileTitle,
        ),
        const SizedBox(height: 16),
        _Group(children: [
          ListTile(
            title: Text(t.profileOrganization),
            subtitle: Text((me?['party'] as Map?)?['name'] as String? ?? ''),
            leading: const Icon(Icons.groups_outlined),
          ),
        ]),
        _Group(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t.profileLanguage, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
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
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
          child: OutlinedButton.icon(
            onPressed: () => ref.read(sessionProvider.notifier).close(),
            icon: const Icon(Icons.logout),
            label: Text(t.profileLogout),
          ),
        ),
        bottomSpace,
      ],
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(22, 0, 22, 12),
        decoration: BoxDecoration(
          color: Palette.surface,
          border: Border.all(color: Palette.line),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/member_card.dart';
import '../../widgets/objects.dart';

/// En-tête d'onglet : petite ligne de contexte, puis le titre en grand.
class TabHeader extends StatelessWidget {
  const TabHeader({super.key, required this.eyebrow, required this.title, this.trailing});
  final String eyebrow;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(eyebrow, style: text.bodyMedium?.copyWith(color: Palette.ink2)),
                const SizedBox(height: 2),
                Text(title, style: text.headlineMedium),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Bloc de données de l'API : squelette pendant le chargement, message et bouton si échec.
class Remote extends ConsumerWidget {
  const Remote(this.path, {super.key, required this.builder, this.skeleton = const Skeleton(height: 120)});
  final String path;
  final Widget Function(Loaded) builder;
  final Widget skeleton;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    return ref
        .watch(apiGet(path))
        .when(
          data: builder,
          loading: () => skeleton,
          error: (e, _) =>
              ErrorRetry(message: errorText(t, e), retry: t.retry, onRetry: () => ref.invalidate(apiGet(path))),
        );
  }
}

/// Bas de page : laisse la place à la barre flottante.
const bottomSpace = SizedBox(height: 120);

/// Modèle de la carte réglé par l'organisation (ADH-13), avec la photo et les lignes du membre à imprimer.
/// Sans la formule qui inclut la carte, ou hors ligne sans modèle en cache : dessin par défaut.
({CardStyle? style, String? photoUrl, List<String> details}) cardDesign(
  WidgetRef ref,
  L t,
  Locale locale, {
  String? since,
}) {
  final data = ref.watch(apiGet('/members/me/card-design')).value?.data;
  if (data == null) return (style: null, photoUrl: null, details: const []);
  final style = CardStyle.fromJson(data, locale.languageCode);
  final m = (data['member'] as Map?) ?? const {};
  final status = m['status'] == null ? '' : tr(m['status'], locale);
  return (
    style: style,
    photoUrl: m['photoUrl'] as String?,
    details: [
      if (style.show('status') && status.isNotEmpty) status,
      if (style.show('since') && since != null) t.cardSince(since),
    ],
  );
}

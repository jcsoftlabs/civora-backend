import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/member_card.dart';
import '../../widgets/objects.dart';

/// Carte de membre en plein écran (ADH-11) : la carte et son QR code signé, à présenter à l'entrée. Enregistrée
/// sur le téléphone : elle s'affiche sans connexion, le contrôle se fait sur l'appareil du responsable.
class CardScreen extends ConsumerWidget {
  const CardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final card = ref.watch(apiGet('/members/me/card'));
    final dues = ref.watch(apiGet('/members/me/dues')).value;
    final upToDate = dues?.data['upToDate'] == true;
    return Scaffold(
      backgroundColor: Palette.ink,
      appBar: AppBar(backgroundColor: Palette.ink, foregroundColor: Palette.paper),
      body: SafeArea(
        child: card.when(
          loading: () => const Padding(padding: EdgeInsets.all(24), child: Skeleton(height: 220, radius: 18)),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              e is ApiError && e.code == 'card_requires_approval' ? t.cardPending : t.errorGeneric,
              style: const TextStyle(color: Palette.paper, fontSize: 16, height: 1.45),
            ),
          ),
          data: (l) {
            final c = l.data;
            final party = c['party'] as Map;
            final m = c['member'] as Map;
            return ListView(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
              children: [
                MemberCard(
                  brand: parseHex(party['brandColor'] as String?),
                  partyName: party['name'] as String,
                  name: m['name'] as String,
                  number: m['number'] as String,
                  memberLabel: t.cardMember,
                  location: m['location'] as String?,
                  since: m['since'] == null ? null : t.cardSince(m['since'] as String),
                  badge: upToDate ? t.duesPaid('${haitiYear()}') : null,
                  tilt: 0,
                ),
                const SizedBox(height: 28),
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                    child: QrImageView(
                      data: c['verifyUrl'] as String,
                      size: 230,
                      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Palette.ink),
                      dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Palette.ink),
                      semanticsLabel: t.cardShow,
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(t.cardShow, textAlign: TextAlign.center, style: const TextStyle(color: Palette.paper, height: 1.45)),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(l.offline ? Icons.cloud_off_outlined : Icons.offline_pin_outlined,
                        size: 16, color: Palette.accent),
                    const SizedBox(width: 6),
                    Text(t.cardOffline, style: const TextStyle(color: Palette.accent, fontSize: 13)),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

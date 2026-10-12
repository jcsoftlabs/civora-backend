import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/nav_icons.dart';
import '../act/act_screen.dart';
import '../me/me_screen.dart';
import '../news/news_screen.dart';
import 'wallet_screen.dart';

/// Coque de l'espace membre. Barre de verre fumé qui flotte au-dessus du contenu : quatre onglets nommés aux icônes
/// dessinées pour civora (le nom reste visible, pour tous les lecteurs), l'onglet actif en bulle de verre éclairée
/// à la couleur du parti ; au centre, la carte de membre en miniature, qui dépasse de la barre et ouvre la carte.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  static const _pages = [WalletScreen(), NewsScreen(), ActScreen(), MeScreen()];

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    final mark = brandOnInk(brand);
    final items = [
      (NavGlyph.home, t.navWallet),
      (NavGlyph.news, t.navNews),
      (NavGlyph.act, t.navAct),
      (NavGlyph.me, t.navMe),
    ];
    Widget tab(int i) {
      final on = _tab == i;
      final fg = on ? Palette.paper : const Color(0xFFB4BCB8);
      return Expanded(
        child: Semantics(
          selected: on,
          button: true,
          label: items[i].$2,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _tab = i),
            child: SizedBox(
              height: 64,
              child: Center(
                // L'onglet actif est une bulle de verre plus claire, en relief dans la barre.
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  width: 78,
                  padding: const EdgeInsets.fromLTRB(4, 7, 4, 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    color: on ? Colors.white.withValues(alpha: 0.14) : Colors.transparent,
                    border: Border.all(color: on ? Colors.white.withValues(alpha: 0.22) : Colors.transparent),
                    boxShadow: on
                        ? [BoxShadow(color: mark.withValues(alpha: 0.35), blurRadius: 14, spreadRadius: -4)]
                        : const [],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      NavIcon(items[i].$1, color: on ? mark : fg, active: on, size: 24),
                      const SizedBox(height: 3),
                      Text(
                        items[i].$2,
                        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: fg),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    final bottom = MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _tab, children: _pages),
      // Barre de verre flottante : le contenu passe dessous, flouté ; reflet en haut, ombre portée en bas.
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(14, 0, 14, bottom > 0 ? bottom : 12),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                boxShadow: const [
                  BoxShadow(color: Color(0x40000000), blurRadius: 28, offset: Offset(0, 14), spreadRadius: -6),
                  BoxShadow(color: Color(0x26000000), blurRadius: 6, offset: Offset(0, 3)),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
                  child: Container(
                    height: 70,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color.alphaBlend(Colors.white.withValues(alpha: 0.14), Palette.ink.withValues(alpha: 0.82)),
                          Palette.ink.withValues(alpha: 0.86),
                        ],
                        stops: const [0, 0.55],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Liseré de lumière sur l'arête supérieure, qui donne l'épaisseur du verre.
            Positioned(
              top: 1,
              left: 28,
              right: 28,
              child: IgnorePointer(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.35))),
            ),
            // Onglets hors du découpage du verre : la carte du centre peut en dépasser.
            Positioned.fill(
              child: Row(
                children: [
                  tab(0),
                  tab(1),
                  _MiniCard(brand: brand, label: t.navScan, onTap: () => context.push('/carte')),
                  tab(2),
                  tab(3),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Miniature de la carte de membre, aux couleurs du parti, qui dépasse de la barre.
class _MiniCard extends StatelessWidget {
  const _MiniCard({required this.brand, required this.label, required this.onTap});
  final Color brand;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final deep = HSLColor.fromColor(brand);
    final body = deep.withLightness((deep.lightness * 0.62).clamp(0.14, 0.34)).toColor();
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 76,
          height: 70,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Positioned(
                top: -16,
                child: Transform.rotate(
                  angle: -0.1,
                  child: Container(
                    width: 52,
                    height: 34,
                    decoration: BoxDecoration(
                      color: body,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Palette.paper, width: 2),
                      boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 10, offset: Offset(0, 4))],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      children: [
                        Positioned(
                          right: -12,
                          bottom: -18,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(shape: BoxShape.circle, color: brand.withValues(alpha: 0.55)),
                          ),
                        ),
                        Positioned(
                          left: 6,
                          top: 6,
                          child: Container(
                            width: 18,
                            height: 4,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF2B84B),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                bottom: 9,
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.paper),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/liquid_glass.dart';
import '../../widgets/nav_icons.dart';
import '../act/act_screen.dart';
import '../me/me_screen.dart';
import '../news/news_screen.dart';
import 'wallet_screen.dart';

/// Coque de l'espace membre. Barre de verre liquide qui flotte au-dessus du contenu (le contenu se courbe près de ses
/// bords) : quatre onglets nommés aux icônes dessinées pour civora (le nom reste visible, pour tous les lecteurs),
/// l'onglet actif dans une bulle qui glisse et s'étire d'un onglet à l'autre ; au centre, la carte de membre en
/// miniature, qui dépasse de la barre et ouvre la carte.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  int _from = 0;
  static const _pages = [WalletScreen(), NewsScreen(), ActScreen(), MeScreen()];

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    // Verre clair : l'onglet actif à la couleur du parti (assombrie si elle est trop claire pour être lue).
    final mark = brandOnPaper(brand);
    final items = [
      (NavGlyph.home, t.navWallet),
      (NavGlyph.news, t.navNews),
      (NavGlyph.act, t.navAct),
      (NavGlyph.me, t.navMe),
    ];
    Widget tab(int i) {
      final on = _tab == i;
      final fg = on ? Palette.ink : Palette.ink2;
      return Expanded(
        child: Semantics(
          selected: on,
          button: true,
          label: items[i].$2,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() {
              _from = _tab;
              _tab = i;
            }),
            child: SizedBox(
              height: 64,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 7, 4, 6),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      NavIcon(items[i].$1, color: on ? mark : Palette.ink2, active: on, size: 24),
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
            // Capsule de verre clair qui flotte : ombre douce dessous, liseré clair sur l'arête.
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(35),
                boxShadow: const [
                  BoxShadow(color: Color(0x33000000), blurRadius: 32, offset: Offset(0, 14), spreadRadius: -6),
                  BoxShadow(color: Color(0x1F000000), blurRadius: 3, offset: Offset(0, 1)),
                ],
              ),
              child: SizedBox(
                height: 70,
                width: double.infinity,
                child: LiquidGlass(
                  radius: 35,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(35),
                      color: Colors.white.withValues(alpha: 0.62),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 1),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.white.withValues(alpha: 0.78), Colors.white.withValues(alpha: 0.56)],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // La bulle de l'onglet actif : une goutte qui glisse, le bord de devant part avant celui de derrière.
            Positioned.fill(
              child: LayoutBuilder(
                builder: (context, box) {
                  final w = (box.maxWidth - 76) / 4;
                  double center(int i) => i < 2 ? (i + 0.5) * w : 2 * w + 76 + (i - 1.5) * w;
                  return TweenAnimationBuilder<double>(
                    tween: Tween(end: _tab.toDouble()),
                    duration: const Duration(milliseconds: 420),
                    builder: (context, v, _) {
                      final a = center(_from);
                      final b = center(_tab);
                      final span = (_tab - _from).toDouble();
                      final p = span == 0 ? 1.0 : ((v - _from) / span).clamp(0.0, 1.0);
                      final lead = a + (b - a) * Curves.easeOutCubic.transform(p);
                      final trail = a + (b - a) * Curves.easeInOutCubic.transform(p);
                      const half = 39.0;
                      final left = (b >= a ? trail : lead) - half;
                      final right = (b >= a ? lead : trail) + half;
                      return Stack(
                        children: [
                          Positioned(
                            left: left,
                            width: right - left,
                            top: 6,
                            height: 58,
                            child: IgnorePointer(
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(22),
                                  gradient: LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Colors.white.withValues(alpha: 0.24),
                                      Colors.white.withValues(alpha: 0.08),
                                    ],
                                  ),
                                  border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
                                ),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
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
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.ink),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'carnet_screen.dart';
import 'profile_screen.dart';
import 'section_screen.dart';
import 'wallet_screen.dart';

/// Coque de l'espace membre : quatre onglets et, au centre de la barre flottante sombre, le bouton surélevé
/// qui montre la carte de membre (à un pouce depuis chaque onglet).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  static const _pages = [WalletScreen(), SectionScreen(), CarnetScreen(), ProfileScreen()];

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final items = [
      (Icons.account_balance_wallet_outlined, t.navWallet),
      (Icons.push_pin_outlined, t.navSection),
      (Icons.menu_book_outlined, t.navCarnet),
      (Icons.person_outline, t.navProfile),
    ];
    Widget tab(int i) => Expanded(
          child: Semantics(
            selected: _tab == i,
            button: true,
            label: items[i].$2,
            child: InkResponse(
              onTap: () => setState(() => _tab = i),
              radius: 28,
              child: SizedBox(
                height: 60,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(items[i].$1, color: _tab == i ? Palette.paper : const Color(0xFF8FA6A1), size: 24),
                    const SizedBox(height: 3),
                    Text(
                      items[i].$2,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _tab == i ? Palette.paper : const Color(0xFF8FA6A1),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _tab, children: _pages),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: SizedBox(
          height: 84,
          child: Stack(
            alignment: Alignment.bottomCenter,
            clipBehavior: Clip.none,
            children: [
              Container(
                height: 64,
                decoration: BoxDecoration(color: Palette.rail, borderRadius: BorderRadius.circular(32)),
                child: Row(children: [tab(0), tab(1), const SizedBox(width: 76), tab(2), tab(3)]),
              ),
              Positioned(
                top: 0,
                child: Semantics(
                  button: true,
                  label: t.navScan,
                  child: Material(
                    color: Palette.accent,
                    shape: const CircleBorder(side: BorderSide(color: Palette.paper, width: 4)),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => context.push('/carte'),
                      child: const SizedBox.square(
                        dimension: 64,
                        child: Icon(Icons.qr_code_2, color: Palette.ink, size: 30),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

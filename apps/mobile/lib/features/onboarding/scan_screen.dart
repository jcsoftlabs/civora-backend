import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/errors.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'join_flow.dart';

/// Scan du QR code de l'organisation (affiche, invitation) : on en tire son identifiant et on passe à la connexion.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _handled = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture c) async {
    if (_handled) return;
    final raw = c.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    final slug = raw == null ? null : JoinFlow.slugFrom(raw);
    if (slug == null) return;
    _handled = true;
    final t = L.of(context);
    try {
      await ref.read(joinFlowProvider.notifier).choose(slug, sponsorCode: JoinFlow.sponsorFrom(raw!));
      if (mounted) context.pushReplacement('/connexion');
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
      _handled = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    return Scaffold(
      backgroundColor: Palette.rail,
      appBar: AppBar(backgroundColor: Palette.rail, foregroundColor: Palette.paper, title: Text(t.welcomeScan)),
      body: Column(
        children: [
          Expanded(
            child: Center(
              child: AspectRatio(
                aspectRatio: 1,
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: MobileScanner(
                      controller: _controller,
                      onDetect: _onDetect,
                      errorBuilder: (_, _) => Center(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Text(
                            t.scanDenied,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Palette.paper),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
            child: Column(
              children: [
                Text(
                  t.scanTitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Palette.paper),
                ),
                const SizedBox(height: 8),
                Text(
                  _error ?? t.scanHelp,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: _error == null ? Palette.line : Palette.accent),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

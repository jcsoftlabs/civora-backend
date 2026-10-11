import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/member_card.dart';
import '../../widgets/objects.dart';
import 'join_flow.dart';

/// Premier écran : les objets du militantisme posés en pile (carte, billet, bulletin), puis deux façons de
/// rejoindre son organisation : scanner son QR code ou saisir son code.
class WelcomeScreen extends ConsumerStatefulWidget {
  const WelcomeScreen({super.key});

  @override
  ConsumerState<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends ConsumerState<WelcomeScreen> {
  bool _typing = false;
  bool _busy = false;
  String? _error;
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    final t = L.of(context);
    final slug = JoinFlow.slugFrom(_code.text);
    if (slug == null) {
      setState(() => _error = t.errorNotFound);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(joinFlowProvider.notifier).choose(slug);
      if (mounted) context.push('/connexion');
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          children: [
            Text('civora', style: text.titleLarge?.copyWith(color: Palette.primaryDeep)),
            const SizedBox(height: 20),
            // Pile d'objets : un aperçu de ce que contient l'espace membre, sans données réelles.
            LayoutBuilder(builder: (context, box) {
              // Carte aux trois quarts de la largeur ; le billet et le bulletin dépassent dessous, en éventail.
              final w = box.maxWidth;
              final cardH = w * 0.78 / 1.586;
              return SizedBox(
                height: cardH + 214,
                child: Stack(
                  children: [
                    Positioned(
                      left: w * 0.16,
                      right: 0,
                      top: cardH + 96,
                      child: BallotSlip(
                        label: t.ballotOpen,
                        title: t.ballotVote,
                        options: [t.yes, t.no],
                        crossed: 0,
                        tilt: 0.035,
                      ),
                    ),
                    Positioned(
                      left: w * 0.06,
                      right: w * 0.08,
                      top: cardH - 2,
                      child: TicketCard(
                        label: t.ticketLabel,
                        title: t.sectionEvent,
                        when: '9:00 AM',
                        tilt: -0.025,
                      ),
                    ),
                    Positioned(
                      left: 0,
                      width: w * 0.78,
                      top: 6,
                      child: const MemberCard(
                        brand: Palette.primary,
                        partyName: 'civora',
                        name: '· · ·',
                        number: '000000',
                        memberLabel: '',
                        tilt: -0.06,
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 28),
            Text(t.welcomeTitle, style: text.headlineMedium),
            const SizedBox(height: 10),
            Text(t.welcomeLead, style: text.bodyLarge?.copyWith(color: Palette.ink2, height: 1.45)),
            const SizedBox(height: 28),
            if (!_typing) ...[
              FilledButton.icon(
                onPressed: () => context.push('/scanner'),
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(t.welcomeScan),
              ),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: () => setState(() => _typing = true), child: Text(t.welcomeCode)),
            ] else ...[
              TextField(
                controller: _code,
                autofocus: true,
                autocorrect: false,
                textInputAction: TextInputAction.go,
                keyboardType: TextInputType.url,
                onSubmitted: (_) => _continue(),
                decoration: InputDecoration(
                  labelText: t.welcomeCodeLabel,
                  hintText: t.welcomeCodeHint,
                  helperText: t.welcomeCodeHelp,
                  helperMaxLines: 3,
                  errorText: _error,
                  errorMaxLines: 3,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _continue, child: Text(t.welcomeContinue)),
              const SizedBox(height: 4),
              TextButton(onPressed: () => context.push('/scanner'), child: Text(t.welcomeScan)),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/member_card.dart';
import '../../widgets/brand_mark.dart';
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
  bool _joining = false;
  bool _busy = false;
  String? _error;
  String? _joinError;
  final _contact = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _contact.dispose();
    _code.dispose();
    super.dispose();
  }

  /// Connexion par l'adresse seule : l'API retrouve l'organisation du membre et envoie le code.
  Future<void> _signIn() async {
    final t = L.of(context);
    var v = _contact.text.trim();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
      setState(() => _error = t.errorInvalidEmail);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final flow = ref.read(joinFlowProvider.notifier)..reset();
      await flow.requestCode('email', v);
      if (mounted) context.push('/code');
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Rejoindre une organisation par son code (affiche, invitation) : écran de connexion à ses couleurs.
  Future<void> _join() async {
    final t = L.of(context);
    final slug = JoinFlow.slugFrom(_code.text);
    if (slug == null) {
      setState(() => _joinError = t.errorNotFound);
      return;
    }
    try {
      await ref.read(joinFlowProvider.notifier).choose(slug, sponsorCode: JoinFlow.sponsorFrom(_code.text));
      if (mounted) context.push('/connexion');
    } on Object catch (e) {
      setState(() => _joinError = errorText(t, e));
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
            Row(
              children: [
                const BrandMark(size: 30),
                const SizedBox(width: 10),
                Text('civora', style: text.titleLarge?.copyWith(color: Palette.primaryDeep)),
              ],
            ),
            const SizedBox(height: 12),
            // Pile d'objets : un aperçu de ce que contient l'espace membre, sans données réelles.
            LayoutBuilder(
              builder: (context, box) {
                // Carte aux trois quarts de la largeur ; le billet et le bulletin dépassent dessous, en éventail.
                final w = box.maxWidth;
                final cardH = w * 0.7 / 1.586;
                return SizedBox(
                  // Carte et billet seulement : les deux façons d'entrer restent visibles sans faire défiler.
                  height: cardH + 112,
                  child: Stack(
                    children: [
                      Positioned(
                        left: w * 0.06,
                        right: w * 0.08,
                        top: cardH - 2,
                        child: TicketCard(label: t.ticketLabel, title: t.sectionEvent, when: '9:00 AM', tilt: -0.025),
                      ),
                      Positioned(
                        left: 0,
                        width: w * 0.7,
                        top: 6,
                        child: MemberCard(
                          brand: Palette.primary,
                          partyName: 'civora',
                          name: '· · ·',
                          number: '000000',
                          numberLabel: t.cardNumber,
                          year: '2026',
                          tilt: -0.06,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            Text(t.welcomeTitle, style: text.headlineMedium),
            const SizedBox(height: 10),
            Text(t.welcomeSignInLead, style: text.bodyLarge?.copyWith(color: Palette.ink2, height: 1.45)),
            const SizedBox(height: 20),
            TextField(
              controller: _contact,
              autocorrect: false,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _signIn(),
              decoration: InputDecoration(
                labelText: t.joinEmail,
                hintText: t.emailHint,
                errorText: _error,
                errorMaxLines: 3,
              ),
            ),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _signIn, child: Text(t.joinSend)),
            // Pas de connexion par SMS ici : aucun fournisseur SMS n'est branché sur la plateforme. Un parti qui
            // l'active le propose sur son propre écran de connexion (otpChannels).
            const SizedBox(height: 10),
            // Deuxième façon d'entrer : le QR code de son organisation (affiche, carte, invitation).
            OutlinedButton.icon(
              onPressed: () => context.push('/scanner'),
              icon: const Icon(Icons.qr_code_scanner),
              label: Text(t.welcomeScan),
            ),
            if (!_joining)
              TextButton(onPressed: () => setState(() => _joining = true), child: Text(t.welcomeHaveCode))
            else ...[
              const SizedBox(height: 12),
              TextField(
                controller: _code,
                autocorrect: false,
                textInputAction: TextInputAction.go,
                keyboardType: TextInputType.url,
                onSubmitted: (_) => _join(),
                decoration: InputDecoration(
                  labelText: t.welcomeCodeLabel,
                  hintText: t.welcomeCodeHint,
                  helperText: t.welcomeCodeHelp,
                  helperMaxLines: 3,
                  errorText: _joinError,
                  errorMaxLines: 3,
                  suffixIcon: IconButton(
                    onPressed: _join,
                    icon: const Icon(Icons.arrow_forward),
                    tooltip: t.welcomeContinue,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

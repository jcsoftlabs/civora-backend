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
  bool _byPhone = false;
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
    if (!_byPhone && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
      setState(() => _error = t.errorInvalidEmail);
      return;
    }
    if (_byPhone) {
      v = v.replaceAll(RegExp(r'[\s.-]'), '');
      if (RegExp(r'^\d{8}$').hasMatch(v)) v = '+509$v';
      if (!RegExp(r'^\+\d{8,15}$').hasMatch(v)) {
        setState(() => _error = t.errorInvalidPhone);
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final flow = ref.read(joinFlowProvider.notifier)..reset();
      await flow.requestCode(_byPhone ? 'sms' : 'email', v);
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
            Text('civora', style: text.titleLarge?.copyWith(color: Palette.primaryDeep)),
            const SizedBox(height: 20),
            // Pile d'objets : un aperçu de ce que contient l'espace membre, sans données réelles.
            LayoutBuilder(
              builder: (context, box) {
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
                        child: TicketCard(label: t.ticketLabel, title: t.sectionEvent, when: '9:00 AM', tilt: -0.025),
                      ),
                      Positioned(
                        left: 0,
                        width: w * 0.78,
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
            const SizedBox(height: 28),
            Text(t.welcomeTitle, style: text.headlineMedium),
            const SizedBox(height: 10),
            Text(t.welcomeSignInLead, style: text.bodyLarge?.copyWith(color: Palette.ink2, height: 1.45)),
            const SizedBox(height: 28),
            TextField(
              controller: _contact,
              autocorrect: false,
              keyboardType: _byPhone ? TextInputType.phone : TextInputType.emailAddress,
              autofillHints: [_byPhone ? AutofillHints.telephoneNumber : AutofillHints.email],
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _signIn(),
              decoration: InputDecoration(
                labelText: _byPhone ? t.joinPhone : t.joinEmail,
                hintText: _byPhone ? t.phoneHint : t.emailHint,
                errorText: _error,
                errorMaxLines: 3,
              ),
            ),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _signIn, child: Text(t.joinSend)),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => setState(() {
                _byPhone = !_byPhone;
                _contact.clear();
                _error = null;
              }),
              child: Text(_byPhone ? t.welcomeUseEmail : t.welcomeUsePhone),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Divider(color: Palette.line),
            ),
            if (!_joining)
              TextButton.icon(
                onPressed: () => setState(() => _joining = true),
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(t.welcomeJoinOrg),
              )
            else ...[
              OutlinedButton.icon(
                onPressed: () => context.push('/scanner'),
                icon: const Icon(Icons.qr_code_scanner),
                label: Text(t.welcomeScan),
              ),
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

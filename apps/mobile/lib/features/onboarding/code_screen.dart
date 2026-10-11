import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/state.dart';
import '../../core/storage.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'join_flow.dart';

/// Saisie du code à 6 chiffres reçu par e-mail ou SMS. Un poste de gestion exige ensuite la double authentification.
class CodeScreen extends ConsumerStatefulWidget {
  const CodeScreen({super.key});

  @override
  ConsumerState<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends ConsumerState<CodeScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final t = L.of(context);
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final flow = ref.read(joinFlowProvider);
      final r = await ref.read(joinFlowProvider.notifier).verify(_code.text);
      final session = Session(
        slug: flow.party!.slug,
        token: r['token'] as String,
        expiresAt: DateTime.parse(r['expiresAt'] as String),
      );
      final mfa = r['mfa'] as String? ?? 'none';
      if (!mounted) return;
      if (mfa == 'none') {
        await ref.read(sessionProvider.notifier).open(session);
        ref.read(joinFlowProvider.notifier).reset();
      } else {
        context.push('/double-authentification', extra: (session, mfa));
      }
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    final flow = ref.read(joinFlowProvider);
    try {
      await ref.read(joinFlowProvider.notifier).requestCode(flow.channel!, flow.destination!);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = errorText(L.of(context), e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final flow = ref.watch(joinFlowProvider);
    final text = Theme.of(context).textTheme;
    final brand = parseHex(flow.party?.brandColor);
    return Theme(
      data: buildTheme(brand),
      child: Scaffold(
        appBar: AppBar(backgroundColor: Palette.paper),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            Text(t.otpTitle, style: text.headlineSmall),
            const SizedBox(height: 8),
            Text(t.otpLead(flow.destination ?? ''), style: text.bodyLarge?.copyWith(color: Palette.ink2)),
            const SizedBox(height: 24),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: text.headlineMedium?.copyWith(letterSpacing: 12),
              onChanged: (v) {
                if (v.length == 6) _verify();
              },
              decoration: InputDecoration(labelText: t.otpLabel, errorText: _error, errorMaxLines: 3),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _verify, child: Text(t.otpVerify)),
            const SizedBox(height: 8),
            TextButton(onPressed: _busy ? null : _resend, child: Text(t.otpResend)),
          ],
        ),
      ),
    );
  }
}

/// Double authentification d'un responsable : code de son application d'authentification (TOTP).
class MfaScreen extends ConsumerStatefulWidget {
  const MfaScreen({super.key, required this.session, required this.mfa});
  final Session session;
  final String mfa;

  @override
  ConsumerState<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends ConsumerState<MfaScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient(token: widget.session.token).post('/auth/mfa/verify', {'code': _code.text});
      await ref.read(sessionProvider.notifier).open(widget.session);
      ref.read(joinFlowProvider.notifier).reset();
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorText(L.of(context), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final text = Theme.of(context).textTheme;
    final setup = widget.mfa == 'setup_required';
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        children: [
          Text(t.mfaTitle, style: text.headlineSmall),
          const SizedBox(height: 8),
          Text(setup ? t.mfaSetupLead : t.mfaLead, style: text.bodyLarge?.copyWith(color: Palette.ink2)),
          if (!setup) ...[
            const SizedBox(height: 24),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: text.headlineMedium?.copyWith(letterSpacing: 12),
              onChanged: (v) {
                if (v.length == 6) _verify();
              },
              decoration: InputDecoration(labelText: t.mfaLabel, errorText: _error, errorMaxLines: 3),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _verify, child: Text(t.mfaVerify)),
          ] else ...[
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: () => context.go('/bienvenue'),
              child: Text(t.joinOther),
            ),
          ],
        ],
      ),
    );
  }
}

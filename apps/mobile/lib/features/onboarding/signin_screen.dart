import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import 'join_flow.dart';

/// Connexion à l'organisation choisie, à ses couleurs : code à usage unique par e-mail ou SMS (selon ses réglages).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _field = TextEditingController();
  String _channel = 'email';
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final channels = ref.read(joinFlowProvider).party?.channels ?? const ['email'];
    _channel = channels.contains('sms') && !channels.contains('email') ? 'sms' : 'email';
  }

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = L.of(context);
    var v = _field.text.trim();
    if (_channel == 'email' && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) {
      setState(() => _error = t.errorInvalidEmail);
      return;
    }
    if (_channel == 'sms') {
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
      await ref.read(joinFlowProvider.notifier).requestCode(_channel, v);
      if (mounted) context.push('/code');
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final party = ref.watch(joinFlowProvider).party;
    if (party == null) return const SizedBox.shrink();
    final brand = parseHex(party.brandColor);
    final on = onColor(brand);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            backgroundColor: brand,
            foregroundColor: on,
            expandedHeight: 190,
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsetsDirectional.fromSTEB(24, 0, 24, 20),
              title: Text(party.name, style: text.titleLarge?.copyWith(color: on)),
              background: ColoredBox(
                color: brand,
                child: Align(
                  alignment: const Alignment(0.85, -0.1),
                  child: Container(
                    width: 64,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: on.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                      party.name.characters.first.toUpperCase(),
                      style: text.headlineMedium?.copyWith(color: on),
                    ),
                  ),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            sliver: SliverList.list(
              children: [
                Text(t.joinSignIn, style: text.headlineSmall),
                const SizedBox(height: 8),
                Text(t.joinLead, style: text.bodyLarge?.copyWith(color: Palette.ink2)),
                const SizedBox(height: 20),
                if (party.channels.length > 1) ...[
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment(value: 'email', label: Text(t.joinByEmail), icon: const Icon(Icons.mail_outline)),
                      ButtonSegment(value: 'sms', label: Text(t.joinBySms), icon: const Icon(Icons.sms_outlined)),
                    ],
                    selected: {_channel},
                    onSelectionChanged: (s) => setState(() {
                      _channel = s.first;
                      _field.clear();
                      _error = null;
                    }),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _field,
                  autocorrect: false,
                  keyboardType: _channel == 'email' ? TextInputType.emailAddress : TextInputType.phone,
                  autofillHints: [_channel == 'email' ? AutofillHints.email : AutofillHints.telephoneNumber],
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    labelText: _channel == 'email' ? t.joinEmail : t.joinPhone,
                    hintText: _channel == 'email' ? t.emailHint : t.phoneHint,
                    errorText: _error,
                    errorMaxLines: 3,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _send, child: Text(t.joinSend)),
                const SizedBox(height: 20),
                OutlinedButton(onPressed: () => context.push('/adhesion'), child: Text(t.joinAdhere(party.name))),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () {
                      ref.read(joinFlowProvider.notifier).reset();
                      context.go('/bienvenue');
                    },
                    child: Text(t.joinOther),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

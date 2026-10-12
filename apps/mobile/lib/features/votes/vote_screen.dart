import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import 'votes_screen.dart';

/// Un scrutin vu par un inscrit (VOT-05, VOT-09). Vote ouvert : le bulletin papier, la croix tracée à l'encre,
/// la confirmation, puis le tampon « Voté » et le code de reçu (gardé nulle part). Résultats certifiés : les voix,
/// et la vérification de son bulletin dans le journal à partir du code.
class VoteScreen extends ConsumerStatefulWidget {
  const VoteScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<VoteScreen> createState() => _VoteScreenState();
}

class _VoteScreenState extends ConsumerState<VoteScreen> {
  final Set<String> _picked = {};
  bool _blank = false;
  bool _busy = false;
  String? _receipt;
  String? _error;

  String get _path => '/votes/${widget.id}';

  Future<void> _submit(L t, Map e) async {
    final sure = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Palette.paper,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.voteConfirmTitle, style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(t.voteConfirmLead, style: const TextStyle(color: Palette.ink2, height: 1.45)),
            const SizedBox(height: 20),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(t.voteConfirm)),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t.cancel)),
          ],
        ),
      ),
    );
    if (sure != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await apiSend(
        ref,
        'POST',
        '$_path/ballot',
        _blank ? {'blank': true} : {'candidateIds': _picked.toList()},
      );
      setState(() => _receipt = r['receiptCode'] as String);
      ref.invalidate(apiGet('/votes'));
    } on ApiError catch (e) {
      setState(() => _error = e.code == 'already_voted' ? t.voteAlready : errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final lang = locale.languageCode;
    final async = ref.watch(apiGet(_path));
    return Scaffold(
      backgroundColor: Palette.paper,
      appBar: AppBar(backgroundColor: Palette.paper),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 320)),
        error: (e, _) =>
            ErrorRetry(message: errorText(t, e), retry: t.retry, onRetry: () => ref.invalidate(apiGet(_path))),
        data: (l) {
          final e = l.data;
          final phase = e['phase'] as String;
          final candidates = (e['candidates'] as List).cast<Map>();
          final multi = e['method'] == 'list';
          final seats = (e['seats'] as int?) ?? 1;
          final results = (e['results'] as List).cast<Map>();
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 40),
            children: [
              Text(
                [phaseLabel(t, phase), if (e['round'] == 2) t.voteRound2].join(' · '),
                style: const TextStyle(color: Palette.ink2),
              ),
              const SizedBox(height: 4),
              Text(tr(e['title'], locale), style: Theme.of(context).textTheme.headlineSmall),
              if (tr(e['description'], locale).isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(tr(e['description'], locale), style: const TextStyle(height: 1.45)),
              ],
              const SizedBox(height: 18),
              if (_receipt != null)
                _Receipt(code: _receipt!)
              else if (phase == 'open' && e['voted'] == true)
                _AlreadyVoted(text: t.voteAlready)
              else if (phase == 'open') ...[
                _Paper(
                  hint: multi ? t.voteChooseUpTo(seats) : t.voteChooseOne,
                  children: [
                    for (final c in candidates)
                      _Choice(
                        label: tr(c['label'], locale),
                        statement: tr(c['statement'], locale),
                        crossed: _picked.contains(c['id']),
                        onTap: () => setState(() {
                          _blank = false;
                          final id = c['id'] as String;
                          if (_picked.contains(id)) {
                            _picked.remove(id);
                          } else if (multi) {
                            if (_picked.length < seats) _picked.add(id);
                          } else {
                            _picked
                              ..clear()
                              ..add(id);
                          }
                        }),
                      ),
                    if (e['allowBlank'] == true)
                      _Choice(
                        label: t.voteBlank,
                        crossed: _blank,
                        onTap: () => setState(() {
                          _blank = !_blank;
                          _picked.clear();
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Icon(Icons.lock_outline, size: 16, color: Palette.ink2),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(t.voteSecret, style: const TextStyle(color: Palette.ink2, fontSize: 13)),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Palette.danger)),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy || (_picked.isEmpty && !_blank) ? null : () => _submit(t, e),
                  child: Text(t.voteSubmit),
                ),
              ] else if (phase == 'preparation')
                Text(t.voteOpensAt(formatDayTime(DateTime.parse(e['opensAt'] as String), lang)))
              else if (results.isEmpty)
                Text(t.voteNotOpen, style: const TextStyle(color: Palette.ink2))
              else ...[
                for (final r in results) _Results(round: r, candidates: candidates, method: e['method'] as String),
                const SizedBox(height: 18),
                _Verify(electionId: widget.id, round: (results.last['round'] as int?) ?? 1),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Feuille du bulletin : bord prédécoupé, consigne, cases.
class _Paper extends StatelessWidget {
  const _Paper({required this.hint, required this.children});
  final String hint;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
    decoration: BoxDecoration(
      color: Palette.cream,
      border: Border.all(color: Palette.line),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(hint, style: const TextStyle(fontSize: 13, color: Palette.ink2)),
        const SizedBox(height: 8),
        ...children,
      ],
    ),
  );
}

/// Une case du bulletin : la croix se trace à l'encre bleue quand on coche.
class _Choice extends StatelessWidget {
  const _Choice({required this.label, required this.crossed, required this.onTap, this.statement = ''});
  final String label;
  final String statement;
  final bool crossed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    checked: crossed,
    button: true,
    child: InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Palette.line)),
        ),
        child: Row(
          children: [
            _AnimatedCross(crossed: crossed),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  if (statement.isNotEmpty)
                    Text(
                      statement,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, color: Palette.ink2),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _AnimatedCross extends StatelessWidget {
  const _AnimatedCross({required this.crossed});
  final bool crossed;

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.of(context).disableAnimations;
    return TweenAnimationBuilder<double>(
      tween: Tween(end: crossed ? 1 : 0),
      duration: still ? Duration.zero : const Duration(milliseconds: 380),
      curve: Curves.easeOut,
      builder: (_, v, _) => SizedBox.square(dimension: 30, child: CustomPaint(painter: _CrossPainter(v))),
    );
  }
}

class _CrossPainter extends CustomPainter {
  _CrossPainter(this.progress);
  final double progress;

  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & s, const Radius.circular(4)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..color = Palette.ink,
    );
    if (progress <= 0) return;
    final p = Paint()
      ..color = Palette.inkBlue
      ..strokeWidth = 3.2
      ..strokeCap = StrokeCap.round;
    // Premier trait, puis le second : la main qui trace la croix.
    final a = (progress * 2).clamp(0.0, 1.0), b = (progress * 2 - 1).clamp(0.0, 1.0);
    final s1 = Offset(s.width * 0.2, s.height * 0.2), e1 = Offset(s.width * 0.82, s.height * 0.84);
    final s2 = Offset(s.width * 0.8, s.height * 0.18), e2 = Offset(s.width * 0.22, s.height * 0.86);
    canvas.drawLine(s1, Offset.lerp(s1, e1, a)!, p);
    if (b > 0) canvas.drawLine(s2, Offset.lerp(s2, e2, b)!, p);
  }

  @override
  bool shouldRepaint(_CrossPainter old) => old.progress != progress;
}

/// Après le dépôt : le tampon « Voté » s'écrase, puis le code de reçu à noter.
class _Receipt extends StatelessWidget {
  const _Receipt({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final still = MediaQuery.of(context).disableAnimations;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: still ? 1 : 0, end: 1),
            duration: const Duration(milliseconds: 420),
            curve: Curves.easeOutBack,
            builder: (_, v, child) => Opacity(
              opacity: v.clamp(0, 1),
              child: Transform.scale(scale: 1.8 - 0.8 * v, child: child),
            ),
            child: Transform.scale(
              scale: 1.7,
              child: Stamp(text: t.carnetVoted, color: Palette.inkBlue, angle: -0.1),
            ),
          ),
        ),
        const SizedBox(height: 40),
        Text(t.voteReceipt, style: const TextStyle(color: Palette.ink2)),
        const SizedBox(height: 6),
        SelectableText(code, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w600, letterSpacing: 3)),
        const SizedBox(height: 10),
        Text(t.voteReceiptLead, style: const TextStyle(height: 1.45)),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: code));
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.voteCopied)));
          },
          icon: const Icon(Icons.copy),
          label: Text(t.voteCopy),
        ),
      ],
    );
  }
}

class _AlreadyVoted extends StatelessWidget {
  const _AlreadyVoted({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Stamp(text: L.of(context).carnetVoted, color: Palette.inkBlue, angle: -0.1),
      const SizedBox(height: 16),
      Text(text, textAlign: TextAlign.center),
    ],
  );
}

/// Résultats certifiés d'un tour : participation, voix par candidat, issue.
class _Results extends StatelessWidget {
  const _Results({required this.round, required this.candidates, required this.method});
  final Map round;
  final List<Map> candidates;
  final String method;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final tally = round['tally'] as Map;
    final outcome = (round['outcome'] as Map?) ?? const {};
    final counts = (tally['counts'] as Map).cast<String, num>();
    final winners = ((outcome['winners'] as List?) ?? const []).cast<String>();
    final top = counts.values.fold<num>(1, (a, b) => b > a ? b : a);
    final lines = counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    String name(String id) => tr(candidates.where((c) => c['id'] == id).firstOrNull?['label'], locale);
    final verdict = outcome['reason'] == 'elected'
        ? (method == 'yes_no' ? t.voteAdopted : null)
        : (outcome['reason'] == 'rejected' ? t.voteRejected : null);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Palette.cream, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t.voteResults, style: Theme.of(context).textTheme.titleMedium),
          Text(
            t.voteTurnout('${tally['turnoutPercent']}'.replaceAll('.', ',')),
            style: const TextStyle(color: Palette.ink2),
          ),
          const SizedBox(height: 12),
          for (final e in lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      InkCrossBox(crossed: winners.contains(e.key), size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(name(e.key), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      Text(t.voteVotes(e.value.toInt())),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: e.value / top,
                      minHeight: 7,
                      color: winners.contains(e.key) ? Palette.ink : Palette.primary,
                      backgroundColor: Palette.line,
                    ),
                  ),
                ],
              ),
            ),
          if (verdict != null) Text(verdict, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Vérifier son bulletin : l'empreinte du code de reçu doit figurer dans le journal publié.
class _Verify extends ConsumerStatefulWidget {
  const _Verify({required this.electionId, required this.round});
  final String electionId;
  final int round;

  @override
  ConsumerState<_Verify> createState() => _VerifyState();
}

class _VerifyState extends ConsumerState<_Verify> {
  final _code = TextEditingController();
  bool? _found;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) return;
    final hash = sha256.convert(utf8.encode('civora-ballot:${widget.electionId}:${widget.round}:$code')).toString();
    try {
      final s = ref.read(sessionProvider).value!;
      final j = await ApiClient(token: s.token).get('/votes/${widget.electionId}/journal?round=${widget.round}');
      setState(() => _found = ((j['hashes'] as List?) ?? const []).contains(hash));
    } on ApiError {
      setState(() => _found = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t.voteVerify, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(
          controller: _code,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: t.voteVerifyLabel, hintText: 'ABCD-EFGH-JKLM'),
          onSubmitted: (_) => _check(),
        ),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: _check, child: Text(t.voteVerify)),
        if (_found != null) ...[
          const SizedBox(height: 10),
          Text(
            _found! ? t.voteVerifyOk : t.voteVerifyMissing,
            style: TextStyle(color: _found! ? Palette.success : Palette.danger, fontWeight: FontWeight.w600),
          ),
        ],
      ],
    );
  }
}

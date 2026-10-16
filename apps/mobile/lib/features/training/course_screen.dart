import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/media.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import 'certificate.dart';
import 'offline_media.dart';
import '../../core/sync.dart';

/// Une formation : modules dans l'ordre, verrouillés tant que le précédent n'est pas réussi (FOR-01) ;
/// chapitres à lire, à regarder ou à ouvrir, marqués « lu » ; quiz du module quand il est ouvert.
class CourseScreen extends ConsumerWidget {
  const CourseScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final path = '/training/$id';
    final async = ref.watch(apiGet(path));
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 260)),
        error: (e, _) =>
            ErrorRetry(message: errorText(t, e), retry: t.retry, onRetry: () => ref.invalidate(apiGet(path))),
        data: (l) {
          final c = l.data;
          final modules = (c['modules'] as List).cast<Map>();
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 40),
            children: [
              Text(tr(c['title'], locale), style: Theme.of(context).textTheme.headlineSmall),
              if (tr(c['description'], locale).isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(tr(c['description'], locale), style: const TextStyle(color: Palette.ink2, height: 1.45)),
              ],
              if ((c['completion'] as Map?)?['number'] != null) ...[
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Stamp(
                    text: t.carnetCertified,
                    date: t.quizCertificate((c['completion'] as Map)['number'] as String),
                  ),
                ),
                if (c['certificates'] == true) ...[
                  const SizedBox(height: 16),
                  CertificateButton(courseId: id, number: (c['completion'] as Map)['number'] as String),
                ],
              ],
              if (l.offline) ...[const SizedBox(height: 16), OfflineBanner(text: t.offline)],
              const SizedBox(height: 16),
              CourseOfflineButton(coursePath: path),
              const SizedBox(height: 18),
              for (final m in modules) _Module(module: m, coursePath: path),
            ],
          );
        },
      ),
    );
  }
}

class _Module extends ConsumerWidget {
  const _Module({required this.module, required this.coursePath});
  final Map module;
  final String coursePath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final locked = module['locked'] == true;
    final passed = module['passed'] == true;
    final brand = Theme.of(context).colorScheme.primary;
    final chapters = (module['chapters'] as List).cast<Map>();
    final pending = ref.watch(syncProvider).pendingIds('training.chapter.view', 'chapterId');
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: locked ? Palette.paper : Palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: passed ? brand : Palette.line, width: passed ? 1.6 : 1),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: !locked && !passed,
          enabled: !locked,
          leading: Icon(
            locked ? Icons.lock_outline : (passed ? Icons.check_circle : Icons.radio_button_unchecked),
            color: locked ? Palette.ink2 : brand,
          ),
          title: Text(tr(module['title'], locale), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(
            locked ? t.courseLocked : (passed ? t.coursePassed : t.courseModule(module['position'] as int? ?? 1)),
            style: const TextStyle(fontSize: 13, color: Palette.ink2),
          ),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          children: [
            for (final ch in chapters)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                leading: Icon(_icon(ch['kind'] as String?), color: Palette.ink2),
                title: Text(tr(ch['title'], locale)),
                trailing: ch['viewed'] == true || pending.contains(ch['id'])
                    ? Text(
                        t.courseViewed,
                        style: const TextStyle(color: Palette.success, fontWeight: FontWeight.w600),
                      )
                    : const Icon(Icons.chevron_right),
                onTap: () => _open(context, ref, ch),
              ),
            if (module['quizOpen'] == true && module['quiz'] != null && !passed)
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                child: FilledButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => QuizScreen(module: module, coursePath: coursePath),
                    ),
                  ),
                  child: Text(t.courseQuiz),
                ),
              ),
          ],
        ),
      ),
    );
  }

  IconData _icon(String? kind) => switch (kind) {
    'youtube' || 'vimeo' || 'video' => Icons.play_circle_outline,
    'audio' => Icons.headphones_outlined,
    'file' || 'document' => Icons.description_outlined,
    _ => Icons.article_outlined,
  };

  Future<void> _open(BuildContext context, WidgetRef ref, Map ch) async {
    // Le chapitre est marqué vu dès qu'il est ouvert (la progression du module en dépend). La saisie passe par la
    // file du téléphone : sans réseau, elle part plus tard, avec son heure d'origine (NFR-01).
    unawaited(ref.read(syncProvider.notifier).record('training.chapter.view', {'chapterId': ch['id']}));
    final embed = ch['embedUrl'] as String?;
    final media = ch['media'] as Map?;
    final slug = ref.read(sessionProvider).value?.slug;
    if (embed != null) {
      await launchUrl(Uri.parse(watchUrl(embed)), mode: LaunchMode.externalApplication);
    } else if (media != null) {
      if (slug != null && await openLocalChapter(context, slug, ch)) return;
      final opened =
          media['url'] != null &&
          await launchUrl(
            Uri.parse(mediaUrl(media['url'] as String)),
            mode: LaunchMode.externalApplication,
          ).catchError((_) => false);
      if (!opened && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(L.of(context).courseMediaOffline)));
      }
    } else if (context.mounted) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => _Reading(chapter: ch)));
    }
  }
}

/// Chapitre texte : page de lecture.
class _Reading extends StatelessWidget {
  const _Reading({required this.chapter});
  final Map chapter;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    return Scaffold(
      backgroundColor: Palette.cream,
      appBar: AppBar(backgroundColor: Palette.cream),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
        children: [
          Text(tr(chapter['title'], locale), style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 14),
          Text(tr(chapter['body'], locale), style: const TextStyle(fontSize: 17, height: 1.6)),
        ],
      ),
    );
  }
}

/// Quiz du module : une question par carte, cases ou boutons radio ; les bonnes réponses ne quittent jamais
/// le serveur, qui renvoie le score et les questions à revoir.
class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key, required this.module, required this.coursePath});
  final Map module;
  final String coursePath;

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  final Map<String, Set<String>> _answers = {};
  Map<String, dynamic>? _result;
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await apiSend(ref, 'POST', '/training/modules/${widget.module['id']}/attempt', {
        'answers': {for (final e in _answers.entries) e.key: e.value.toList()},
      });
      setState(() => _result = r);
      ref.invalidate(apiGet(widget.coursePath));
      ref.invalidate(apiGet('/training'));
    } on ApiError catch (e) {
      setState(() => _error = errorText(L.of(context), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final quiz = (widget.module['quiz'] as List).cast<Map>();
    final wrong = ((_result?['wrongQuestionIds'] as List?) ?? const []).cast<String>();
    final passed = _result?['passed'] == true;
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.quizTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 40),
        children: [
          if (_result != null) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: (passed ? Palette.success : Palette.warning).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.quizScore(_result!['scorePercent'] as int),
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(passed ? t.quizPassed : t.quizFailed),
                  if (_result!['attemptsLeft'] is int && !passed)
                    Text(
                      t.quizAttemptsLeft(_result!['attemptsLeft'] as int),
                      style: const TextStyle(color: Palette.ink2),
                    ),
                  if (_result!['certificateNumber'] != null) ...[
                    const SizedBox(height: 12),
                    Stamp(text: t.carnetCertified, date: t.quizCertificate(_result!['certificateNumber'] as String)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          for (final (i, q) in quiz.indexed)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Palette.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: wrong.contains(q['id']) ? Palette.warning : Palette.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (wrong.contains(q['id']))
                    Text(
                      t.quizWrong,
                      style: const TextStyle(color: Palette.warning, fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                  Text(
                    '${i + 1}. ${tr(q['question'], locale)}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.35),
                  ),
                  const SizedBox(height: 8),
                  for (final ch in (q['choices'] as List).cast<Map>()) _option(q, ch, locale),
                ],
              ),
            ),
          if (_error != null) Text(_error!, style: const TextStyle(color: Palette.danger)),
          if (!passed)
            FilledButton(onPressed: _busy || _answers.length < quiz.length ? null : _submit, child: Text(t.quizSubmit)),
        ],
      ),
    );
  }

  Widget _option(Map q, Map ch, Locale locale) {
    final qid = q['id'] as String, cid = ch['id'] as String;
    final multiple = q['multiple'] == true;
    final selected = _answers[qid]?.contains(cid) ?? false;
    void toggle() => setState(() {
      final set = _answers.putIfAbsent(qid, () => {});
      if (multiple) {
        selected ? set.remove(cid) : set.add(cid);
        if (set.isEmpty) _answers.remove(qid);
      } else {
        set
          ..clear()
          ..add(cid);
      }
    });
    return InkWell(
      onTap: toggle,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          children: [
            Icon(
              multiple
                  ? (selected ? Icons.check_box : Icons.check_box_outline_blank)
                  : (selected ? Icons.radio_button_checked : Icons.radio_button_unchecked),
              color: selected ? Theme.of(context).colorScheme.primary : Palette.ink2,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(tr(ch['text'], locale), style: const TextStyle(fontSize: 15))),
          ],
        ),
      ),
    );
  }
}

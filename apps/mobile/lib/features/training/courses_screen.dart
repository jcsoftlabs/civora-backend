import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

/// Formations du membre (FOR-01 à FOR-03) : obligatoires d'abord, avec la progression par module.
class CoursesScreen extends ConsumerWidget {
  const CoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.coursesTitle)),
      body: Remote(
        '/training',
        skeleton: const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 120)),
        builder: (l) {
          final courses = (l.data['courses'] as List).cast<Map>().toList()
            ..sort((a, b) => (b['mandatory'] == true ? 1 : 0).compareTo(a['mandatory'] == true ? 1 : 0));
          if (courses.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(22),
              child: Text(t.coursesEmpty, style: const TextStyle(color: Palette.ink2)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 40),
            children: [
              for (final c in courses)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _CourseCard(
                    title: tr(c['title'], locale),
                    description: tr(c['description'], locale),
                    done: (c['passedModules'] as int?) ?? 0,
                    total: (c['moduleCount'] as int?) ?? 0,
                    mandatory: c['mandatory'] == true,
                    completed: c['completed'] == true,
                    certificate: c['certificateNumber'] as String?,
                    onTap: () => context.push('/formations/${c['id']}'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard({
    required this.title,
    required this.description,
    required this.done,
    required this.total,
    required this.mandatory,
    required this.completed,
    required this.certificate,
    required this.onTap,
  });
  final String title;
  final String description;
  final int done;
  final int total;
  final bool mandatory;
  final bool completed;
  final String? certificate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final brand = Theme.of(context).colorScheme.primary;
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Palette.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (mandatory) _Chip(text: t.courseMandatory, color: Palette.warning),
                  if (completed) _Chip(text: t.courseDone, color: Palette.success),
                ],
              ),
              if (mandatory || completed) const SizedBox(height: 8),
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Palette.ink2, height: 1.4),
                ),
              ],
              const SizedBox(height: 14),
              // Un segment par module : plein quand le module est réussi.
              Row(
                children: [
                  for (var i = 0; i < total; i++)
                    Expanded(
                      child: Container(
                        height: 6,
                        margin: EdgeInsets.only(right: i == total - 1 ? 0 : 4),
                        decoration: BoxDecoration(
                          color: i < done ? brand : Palette.line,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                certificate != null ? t.quizCertificate(certificate!) : t.sectionModules(done, total),
                style: const TextStyle(fontSize: 13, color: Palette.ink2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(right: 6),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(6)),
    child: Text(
      text,
      style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
    ),
  );
}

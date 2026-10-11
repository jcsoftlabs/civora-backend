import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/theme.dart';

TextStyle _label = GoogleFonts.figtree(fontSize: 12, color: Palette.ink2, fontWeight: FontWeight.w500);
TextStyle _title = GoogleFonts.figtree(fontSize: 17, color: Palette.ink, fontWeight: FontWeight.w600, height: 1.25);

/// Billet de rassemblement : demi-cercles découpés sur les côtés, ligne pointillée, talon avec la date.
class TicketCard extends StatelessWidget {
  const TicketCard({
    super.key,
    required this.label,
    required this.title,
    required this.when,
    this.place,
    this.footnote,
    this.tilt = 0.02,
    this.onTap,
  });
  final String label;
  final String title;
  final String when;
  final String? place;
  final String? footnote;
  final double tilt;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: tilt,
      child: PhysicalShape(
        clipper: const _TicketClipper(notch: 11, at: 0.62),
        color: Palette.surface,
        elevation: 0,
        child: InkWell(
          onTap: onTap,
          child: CustomPaint(
            painter: const _PerforationPainter(at: 0.62),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 62,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label, style: _label),
                        const SizedBox(height: 4),
                        Text(title, style: _title, maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (place != null) ...[
                          const SizedBox(height: 4),
                          Text(place!, style: _label, maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 28),
                  Expanded(
                    flex: 38,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(when, style: GoogleFonts.figtree(fontSize: 14, fontWeight: FontWeight.w600, height: 1.3)),
                        if (footnote != null) ...[
                          const SizedBox(height: 6),
                          Text(footnote!, style: _label),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TicketClipper extends CustomClipper<Path> {
  const _TicketClipper({required this.notch, required this.at});
  final double notch;
  final double at;

  @override
  Path getClip(Size s) {
    final x = s.width * at;
    final r = RRect.fromRectAndRadius(Offset.zero & s, const Radius.circular(14));
    final cut = Path()
      ..addOval(Rect.fromCircle(center: Offset(x, 0), radius: notch))
      ..addOval(Rect.fromCircle(center: Offset(x, s.height), radius: notch));
    return Path.combine(PathOperation.difference, Path()..addRRect(r), cut);
  }

  @override
  bool shouldReclip(_TicketClipper old) => false;
}

class _PerforationPainter extends CustomPainter {
  const _PerforationPainter({required this.at});
  final double at;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = Palette.line;
    final x = size.width * at;
    for (double y = 16; y < size.height - 14; y += 8) {
      canvas.drawCircle(Offset(x, y), 1.4, p);
    }
  }

  @override
  bool shouldRepaint(_PerforationPainter old) => false;
}

/// Bulletin papier : bord prédécoupé en haut, cases à cocher ; la croix est tracée à l'encre bleue.
class BallotSlip extends StatelessWidget {
  const BallotSlip({
    super.key,
    required this.label,
    required this.title,
    required this.options,
    this.crossed,
    this.action,
    this.tilt = -0.012,
    this.onTap,
  });
  final String label;
  final String title;
  final List<String> options;

  /// Index de l'option cochée (bulletin déjà déposé, montré sans dévoiler le choix : null).
  final int? crossed;
  final String? action;
  final double tilt;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: tilt,
      child: Material(
        color: Palette.cream,
        shape: const RoundedRectangleBorder(
          side: BorderSide(color: Palette.line),
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(6)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 6, child: CustomPaint(painter: _TearPainter())),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: _label),
                    const SizedBox(height: 4),
                    Text(title, style: _title),
                    if (options.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 18,
                        runSpacing: 8,
                        children: [
                          for (final (i, o) in options.indexed)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                InkCrossBox(crossed: crossed == i),
                                const SizedBox(width: 8),
                                Text(o, style: GoogleFonts.figtree(fontSize: 15, fontWeight: FontWeight.w500)),
                              ],
                            ),
                        ],
                      ),
                    ],
                    if (action != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        action!,
                        style: GoogleFonts.figtree(fontSize: 15, fontWeight: FontWeight.w600, color: Palette.inkBlue),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Case du bulletin ; cochée, une croix à l'encre bleue.
class InkCrossBox extends StatelessWidget {
  const InkCrossBox({super.key, required this.crossed, this.size = 20});
  final bool crossed;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _CrossPainter(crossed)),
      );
}

class _CrossPainter extends CustomPainter {
  _CrossPainter(this.crossed);
  final bool crossed;

  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & s, const Radius.circular(3)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = Palette.ink,
    );
    if (!crossed) return;
    final p = Paint()
      ..color = Palette.inkBlue
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(s.width * 0.18, s.height * 0.2), Offset(s.width * 0.84, s.height * 0.82), p);
    canvas.drawLine(Offset(s.width * 0.82, s.height * 0.16), Offset(s.width * 0.2, s.height * 0.86), p);
  }

  @override
  bool shouldRepaint(_CrossPainter old) => old.crossed != crossed;
}

/// Bord prédécoupé : une rangée de petits trous.
class _TearPainter extends CustomPainter {
  const _TearPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = Palette.line;
    for (double x = 6; x < size.width; x += 9) {
      canvas.drawCircle(Offset(x, size.height / 2 + 1), 1.6, p);
    }
  }

  @override
  bool shouldRepaint(_TearPainter old) => false;
}

/// Note épinglée au tableau de la section : papier, ruban adhésif ambre, légère rotation.
class PinnedNote extends StatelessWidget {
  const PinnedNote({
    super.key,
    required this.label,
    required this.title,
    this.body,
    this.footnote,
    this.color = Palette.surface,
    this.onColor = Palette.ink,
    this.tilt = 0,
    this.tapeAt = 0.5,
    this.onTap,
  });
  final String label;
  final String title;
  final String? body;
  final String? footnote;
  final Color color;
  final Color onColor;
  final double tilt;
  final double tapeAt;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final sub = onColor.withValues(alpha: 0.72);
    return Transform.rotate(
      angle: tilt,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Material(
            color: color,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: _label.copyWith(color: sub)),
                    const SizedBox(height: 4),
                    Text(title, style: _title.copyWith(color: onColor)),
                    if (body != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        body!,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.figtree(fontSize: 14, height: 1.45, color: onColor),
                      ),
                    ],
                    if (footnote != null) ...[
                      const SizedBox(height: 8),
                      Text(footnote!, style: _label.copyWith(color: sub)),
                    ],
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: -7,
            left: 0,
            right: 0,
            child: Align(
              alignment: Alignment(tapeAt * 2 - 1, 0),
              child: Transform.rotate(
                angle: -0.06,
                child: Container(width: 46, height: 16, color: Palette.accent.withValues(alpha: 0.72)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tampon : texte en capitales dans un cadre, encre rouge brique (ou bleue pour un vote), légère rotation.
class Stamp extends StatelessWidget {
  const Stamp({super.key, required this.text, this.date, this.color = Palette.stamp, this.angle = -0.12});
  final String text;
  final String? date;
  final Color color;
  final double angle;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: angle,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            border: Border.all(color: color.withValues(alpha: 0.85), width: 2.2),
            borderRadius: BorderRadius.circular(5),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                text,
                style: GoogleFonts.figtree(
                  color: color.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  letterSpacing: 1.6,
                ),
              ),
              if (date != null)
                Text(
                  date!,
                  style: GoogleFonts.figtree(color: color.withValues(alpha: 0.8), fontSize: 11, letterSpacing: 0.8),
                ),
            ],
          ),
        ),
      );
}

/// Squelette animé (jamais d'indicateur rotatif) : pulsation douce de la forme attendue.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 80, this.radius = 14, this.width});
  final double height;
  final double radius;
  final double? width;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.of(context).disableAnimations;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, _) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: Color.lerp(Palette.line, Palette.surface, still ? 0.3 : _c.value * 0.6),
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

/// Bandeau « hors ligne » : les informations affichées sont les dernières enregistrées.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Palette.warning.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.cloud_off_outlined, size: 18, color: Palette.warning),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: GoogleFonts.figtree(fontSize: 13, color: Palette.ink))),
          ],
        ),
      );
}

/// Message d'erreur : ce qui s'est passé, et le bouton pour réessayer.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.retry, required this.onRetry});
  final String message;
  final String retry;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center, style: GoogleFonts.figtree(fontSize: 15, height: 1.45)),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: Text(retry)),
          ],
        ),
      );
}

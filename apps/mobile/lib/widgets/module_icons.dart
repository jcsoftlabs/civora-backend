import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Modules de l'onglet Agir, dessinés comme des objets du militantisme (skill ui-design) plutôt qu'avec des
/// pictogrammes du commerce : urne, livre, billet, pièces, micro, tirages photo, cartes de membre.
enum ModuleKind { votes, training, events, dues, podcasts, albums, referral }

/// Pastille d'un module : l'objet dessiné sur un fond teinté, posée de travers comme un autocollant.
class ModuleSticker extends StatelessWidget {
  const ModuleSticker({
    super.key,
    required this.kind,
    required this.label,
    required this.onTap,
    this.state,
    this.stateColor,
    this.count = 0,
    this.tilt = 0,
  });

  final ModuleKind kind;
  final String label;
  final String? state;
  final Color? stateColor;
  final int count;
  final double tilt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = Theme.of(context).colorScheme.primary;
    // Fonds alternés : teinte du parti, ambre, papier fort ; jamais deux voisins identiques.
    final tint = switch (kind) {
      ModuleKind.votes || ModuleKind.dues || ModuleKind.albums => brand.withValues(alpha: 0.12),
      ModuleKind.training || ModuleKind.referral => Palette.accent.withValues(alpha: 0.22),
      _ => const Color(0xFFE9E2D6),
    };
    return Semantics(
      button: true,
      label: [label, ?state].join(', '),
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              SizedBox(
                width: 92,
                height: 92,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Transform.rotate(
                      angle: tilt,
                      child: Container(
                        width: 92,
                        height: 92,
                        decoration: ShapeDecoration(
                          color: tint,
                          shape: ContinuousRectangleBorder(borderRadius: BorderRadius.circular(46)),
                        ),
                        padding: const EdgeInsets.all(14),
                        child: CustomPaint(painter: _ObjectPainter(kind, brand)),
                      ),
                    ),
                    if (count > 0)
                      Positioned(
                        right: -6,
                        top: -6,
                        child: Transform.rotate(
                          angle: -0.18,
                          child: Container(
                            width: 30,
                            height: 30,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Palette.paper,
                              border: Border.all(color: Palette.stamp, width: 2.2),
                            ),
                            child: Text(
                              '$count',
                              style: const TextStyle(color: Palette.stamp, fontWeight: FontWeight.w700, fontSize: 14),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: -0.1),
              ),
              if (state != null) ...[
                const SizedBox(height: 2),
                Text(
                  state!,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    color: stateColor ?? Palette.ink2,
                    fontWeight: stateColor == null ? FontWeight.w400 : FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Les objets, dessinés sur une grille de 64 : trait à la couleur du parti, aplats ambre, détails à l'encre.
class _ObjectPainter extends CustomPainter {
  _ObjectPainter(this.kind, this.brand);
  final ModuleKind kind;
  final Color brand;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..color = brand;
    Paint fill(Color c) => Paint()..color = c;
    final white = fill(Colors.white);
    final amber = fill(Palette.accent);
    final ink = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round
      ..color = Palette.ink;
    RRect rr(double l, double t, double r, double b, double rad) => RRect.fromLTRBR(l, t, r, b, Radius.circular(rad));

    switch (kind) {
      case ModuleKind.votes:
        // Bulletin coché d'une croix bleue, qui glisse dans l'urne.
        canvas.save();
        canvas.translate(32, 18);
        canvas.rotate(-0.12);
        final paper = rr(-10, -12, 10, 12, 2);
        canvas.drawRRect(paper, white);
        canvas.drawRRect(paper, stroke..strokeWidth = 2.2);
        final blue = Paint()
          ..color = Palette.inkBlue
          ..strokeWidth = 2.6
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(const Offset(-5, -5), const Offset(4, 4), blue);
        canvas.drawLine(const Offset(4, -5), const Offset(-5, 4), blue);
        canvas.restore();
        final urn = rr(10, 30, 54, 58, 5);
        canvas.drawRRect(urn, fill(brand));
        canvas.drawRRect(urn, stroke..strokeWidth = 2.6);
        canvas.drawLine(const Offset(22, 30), const Offset(42, 30), ink..strokeWidth = 4);
        canvas.drawRRect(rr(25, 40, 39, 46, 2), amber);
      case ModuleKind.training:
        // Livre ouvert, ruban ambre.
        final left = Path()
          ..moveTo(32, 18)
          ..quadraticBezierTo(20, 12, 7, 15)
          ..lineTo(7, 50)
          ..quadraticBezierTo(20, 47, 32, 53)
          ..close();
        final right = Path()
          ..moveTo(32, 18)
          ..quadraticBezierTo(44, 12, 57, 15)
          ..lineTo(57, 50)
          ..quadraticBezierTo(44, 47, 32, 53)
          ..close();
        canvas.drawPath(left, white);
        canvas.drawPath(right, white);
        canvas.drawPath(left, stroke);
        canvas.drawPath(right, stroke);
        for (final y in [26.0, 33.0, 40.0]) {
          canvas.drawLine(Offset(13, y), Offset(26, y + 1.5), ink..strokeWidth = 1.6);
        }
        canvas.drawPath(
          Path()
            ..moveTo(44, 15)
            ..lineTo(50, 15)
            ..lineTo(50, 34)
            ..lineTo(47, 30)
            ..lineTo(44, 34)
            ..close(),
          amber,
        );
      case ModuleKind.events:
        // Billet perforé, talon à droite.
        canvas.save();
        canvas.translate(32, 32);
        canvas.rotate(-0.16);
        final ticket = Path.combine(
          PathOperation.difference,
          Path()..addRRect(rr(-26, -14, 26, 14, 4)),
          Path()
            ..addOval(Rect.fromCircle(center: const Offset(12, -14), radius: 4))
            ..addOval(Rect.fromCircle(center: const Offset(12, 14), radius: 4)),
        );
        canvas.drawPath(ticket, amber);
        canvas.drawPath(ticket, stroke);
        for (double y = -8; y <= 8; y += 4) {
          canvas.drawCircle(Offset(12, y), 1.1, fill(Palette.ink));
        }
        canvas.drawLine(const Offset(-18, -4), const Offset(2, -4), ink..strokeWidth = 2.4);
        canvas.drawLine(const Offset(-18, 4), const Offset(-4, 4), ink..strokeWidth = 2.4);
        canvas.restore();
      case ModuleKind.dues:
        // Billet de banque derrière une pile de pièces.
        canvas.save();
        canvas.translate(26, 26);
        canvas.rotate(-0.2);
        final note = rr(-18, -11, 18, 11, 3);
        canvas.drawRRect(note, fill(brand.withValues(alpha: 0.85)));
        canvas.drawCircle(Offset.zero, 5, Paint()..color = Colors.white.withValues(alpha: 0.85));
        canvas.restore();
        for (final (i, y) in [50.0, 43.0, 36.0].indexed) {
          final r = Rect.fromCenter(center: Offset(42, y), width: 26, height: 10);
          canvas.drawRect(Rect.fromLTRB(r.left, y, r.right, y + 5), amber);
          canvas.drawOval(r.shift(const Offset(0, 5)), amber);
          canvas.drawOval(r.shift(const Offset(0, 5)), ink..strokeWidth = 2);
          canvas.drawOval(r, fill(i == 2 ? const Color(0xFFF2B84B) : Palette.accent));
          canvas.drawOval(r, ink..strokeWidth = 2);
        }
      case ModuleKind.podcasts:
        // Micro de meeting sur son pied.
        final head = rr(22, 8, 42, 38, 10);
        canvas.drawRRect(head, fill(brand));
        for (final y in [16.0, 22.0, 28.0]) {
          canvas.drawLine(
            Offset(26, y),
            Offset(38, y),
            Paint()
              ..color = Colors.white.withValues(alpha: 0.8)
              ..strokeWidth = 2
              ..strokeCap = StrokeCap.round,
          );
        }
        canvas.drawArc(const Rect.fromLTRB(14, 18, 50, 46), 0.15, math.pi - 0.3, false, ink);
        canvas.drawLine(const Offset(32, 46), const Offset(32, 54), ink);
        canvas.drawLine(const Offset(22, 56), const Offset(42, 56), ink);
        canvas.drawCircle(const Offset(48, 12), 4, amber);
      case ModuleKind.albums:
        // Deux tirages, l'un posé sur l'autre.
        void polaroid(double angle, Offset at, bool front) {
          canvas.save();
          canvas.translate(at.dx, at.dy);
          canvas.rotate(angle);
          final frame = rr(-15, -17, 15, 17, 2);
          canvas.drawRRect(frame, white);
          canvas.drawRRect(frame, stroke..strokeWidth = 2);
          final pic = Rect.fromLTRB(-11, -13, 11, 7);
          canvas.drawRect(pic, fill(front ? brand.withValues(alpha: 0.2) : const Color(0xFFE9E2D6)));
          if (front) {
            canvas.drawCircle(const Offset(5, -6), 3.5, amber);
            canvas.drawPath(
              Path()
                ..moveTo(-11, 7)
                ..lineTo(-3, -3)
                ..lineTo(3, 3)
                ..lineTo(7, -1)
                ..lineTo(11, 7)
                ..close(),
              fill(brand),
            );
          }
          canvas.restore();
        }
        polaroid(-0.22, const Offset(25, 30), false);
        polaroid(0.14, const Offset(38, 35), true);
      case ModuleKind.referral:
        // Deux cartes de membre : la sienne, et celle du filleul qui arrive.
        void card(double angle, Offset at, Color color, bool person) {
          canvas.save();
          canvas.translate(at.dx, at.dy);
          canvas.rotate(angle);
          final c = rr(-17, -11, 17, 11, 3.5);
          canvas.drawRRect(c, fill(color));
          canvas.drawRRect(c, stroke..strokeWidth = 2);
          if (person) {
            canvas.drawCircle(const Offset(-8, -2), 4, fill(Palette.ink));
            canvas.drawLine(const Offset(0, -3), const Offset(11, -3), ink..strokeWidth = 2);
            canvas.drawLine(const Offset(0, 3), const Offset(8, 3), ink..strokeWidth = 2);
          } else {
            canvas.drawRRect(rr(-12, -6, 0, -3, 1.5), fill(const Color(0xFFF2B84B)));
          }
          canvas.restore();
        }
        card(-0.25, const Offset(26, 26), brand, false);
        card(0.12, const Offset(38, 40), Palette.accent, true);
        canvas.drawCircle(const Offset(54, 14), 7, fill(Palette.ink));
        final plus = Paint()
          ..color = Colors.white
          ..strokeWidth = 2.2
          ..strokeCap = StrokeCap.round;
        canvas.drawLine(const Offset(54, 10.5), const Offset(54, 17.5), plus);
        canvas.drawLine(const Offset(50.5, 14), const Offset(57.5, 14), plus);
    }
  }

  @override
  bool shouldRepaint(_ObjectPainter old) => old.kind != kind || old.brand != brand;
}

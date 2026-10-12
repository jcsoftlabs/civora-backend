import 'package:flutter/material.dart';

/// Icônes de la barre de navigation, dessinées pour civora sur une grille de 24 : le local du parti (Accueil),
/// la note épinglée (Actus), le mégaphone (Agir), le badge à cordon (Moi). Trait de 1,8 ; l'onglet actif remplit
/// la forme d'une teinte claire de sa couleur et marque son détail (porte, punaise, pavillon, visage).
enum NavGlyph { home, news, act, me }

class NavIcon extends StatelessWidget {
  const NavIcon(this.glyph, {super.key, required this.color, this.active = false, this.size = 26});
  final NavGlyph glyph;
  final Color color;
  final bool active;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: _NavPainter(glyph, color, active)),
  );
}

class _NavPainter extends CustomPainter {
  _NavPainter(this.glyph, this.color, this.active);
  final NavGlyph glyph;
  final Color color;
  final bool active;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()..color = color.withValues(alpha: active ? 0.24 : 0);
    final solid = Paint()..color = color;

    switch (glyph) {
      case NavGlyph.home:
        final body = RRect.fromLTRBR(5.5, 10, 18.5, 20.5, const Radius.circular(1.6));
        canvas.drawRRect(body, fill);
        canvas.drawRRect(body, stroke);
        canvas.drawPath(
          Path()
            ..moveTo(3, 11.2)
            ..lineTo(12, 3.6)
            ..lineTo(21, 11.2),
          stroke,
        );
        final door = Path()
          ..moveTo(10, 20.5)
          ..lineTo(10, 16.2)
          ..arcToPoint(const Offset(14, 16.2), radius: const Radius.circular(2))
          ..lineTo(14, 20.5);
        if (active) canvas.drawPath(door, solid);
        canvas.drawPath(door, stroke);
      case NavGlyph.news:
        canvas.save();
        canvas.translate(12, 13);
        canvas.rotate(-0.08);
        canvas.translate(-12, -13);
        final note = RRect.fromLTRBR(5, 5.5, 19, 21, const Radius.circular(1.6));
        canvas.drawRRect(note, fill);
        canvas.drawRRect(note, stroke);
        for (final (y, x2) in [(11.0, 16.0), (14.5, 16.0), (18.0, 12.5)]) {
          canvas.drawLine(Offset(8, y), Offset(x2, y), stroke);
        }
        canvas.restore();
        canvas.drawCircle(const Offset(12, 5.2), 2.3, active ? solid : (Paint()..color = color));
      case NavGlyph.act:
        final horn = Path()
          ..moveTo(4, 10)
          ..lineTo(12.5, 7)
          ..lineTo(18.5, 3.8)
          ..lineTo(18.5, 19.2)
          ..lineTo(12.5, 16)
          ..lineTo(4, 14)
          ..close();
        canvas.drawPath(horn, fill);
        if (active) canvas.drawRect(const Rect.fromLTRB(4, 10, 6.6, 14), solid);
        canvas.drawPath(horn, stroke);
        canvas.drawPath(
          Path()
            ..moveTo(7, 14.6)
            ..lineTo(8.4, 19.5)
            ..lineTo(11, 19.5)
            ..lineTo(10.2, 15.4),
          stroke,
        );
        canvas.drawArc(const Rect.fromLTRB(17.5, 8.5, 23.5, 14.5), -0.9, 1.8, false, stroke);
      case NavGlyph.me:
        final badge = RRect.fromLTRBR(5, 5, 19, 21.5, const Radius.circular(2.4));
        canvas.drawRRect(badge, fill);
        canvas.drawRRect(badge, stroke);
        canvas.drawLine(const Offset(9.5, 2.5), const Offset(14.5, 2.5), stroke);
        canvas.drawLine(const Offset(12, 2.5), const Offset(12, 5), stroke);
        if (active) canvas.drawCircle(const Offset(12, 11.2), 2.6, solid);
        canvas.drawCircle(const Offset(12, 11.2), 2.6, stroke);
        canvas.drawPath(
          Path()
            ..moveTo(8.2, 18.2)
            ..quadraticBezierTo(12, 13.6, 15.8, 18.2),
          stroke,
        );
    }
  }

  @override
  bool shouldRepaint(_NavPainter old) => old.glyph != glyph || old.color != color || old.active != active;
}

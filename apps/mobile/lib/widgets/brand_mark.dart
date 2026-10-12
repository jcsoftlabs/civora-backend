import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Marque civora (même dessin que packages/ui BrandMark) : des militants en cercle ouvert dessinent le « c »,
/// le point ambre dans l'ouverture est le membre qui rejoint.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 28, this.dot = Palette.primary, this.join = Palette.accent});
  final double size;
  final Color dot;
  final Color join;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: _MarkPainter(dot, join)),
  );
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.dot, this.join);
  final Color dot;
  final Color join;
  static const _dots = [
    Offset(35.5, 14.4),
    Offset(26.6, 9.2),
    Offset(16.5, 11),
    Offset(9.9, 18.9),
    Offset(9.9, 29.1),
    Offset(16.5, 37),
    Offset(26.6, 38.8),
    Offset(35.5, 33.6),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48);
    final p = Paint()..color = dot;
    for (final o in _dots) {
      canvas.drawCircle(o, 3.6, p);
    }
    canvas.drawCircle(const Offset(42, 24), 4.4, Paint()..color = join);
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.dot != dot || old.join != join;
}

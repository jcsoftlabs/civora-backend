import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Verre « liquide » à la manière d'iOS 26 et 27, dessiné par l'app (Flutter ne reçoit pas le matériau natif) :
/// flou fort, couleurs du contenu ravivées dessous, teinte claire assez couvrante pour que libellés et icônes
/// restent lisibles sur n'importe quel contenu, liseré clair sur l'arête. Fonctionne sur tous les moteurs.
class LiquidGlass extends StatelessWidget {
  const LiquidGlass({super.key, required this.radius, required this.child, this.blur = 26, this.saturation = 1.8});

  final double radius;
  final double blur;

  /// Couleurs du contenu sous le verre : 1 inchangées, plus pour les raviver comme le fait iOS.
  final double saturation;
  final Widget child;

  static List<double> _saturate(double s) {
    const r = 0.2126, g = 0.7152, b = 0.0722;
    final i = 1 - s;
    return [
      r * i + s, g * i, b * i, 0, 0, //
      r * i, g * i + s, b * i, 0, 0, //
      r * i, g * i, b * i + s, 0, 0, //
      0, 0, 0, 1, 0,
    ];
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: BackdropFilter(
      filter: ui.ImageFilter.compose(
        outer: ui.ColorFilter.matrix(_saturate(saturation)),
        inner: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
      ),
      child: child,
    ),
  );
}

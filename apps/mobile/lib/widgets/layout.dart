import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Rythme vertical (4/8) et échelle de texte : Figtree seule, 40, 28, 20, 16, 13 ; titres serrés, chiffres tabulaires.
abstract final class Space {
  static const xs = 4.0, s = 8.0, m = 16.0, l = 24.0, xl = 32.0, xxl = 48.0;
  static const gutter = 22.0;
}

abstract final class Txt {
  static const display = TextStyle(
    fontFamily: 'Figtree',
    fontSize: 40,
    height: 1.04,
    fontWeight: FontWeight.w600,
    letterSpacing: -1,
  );
  static const title = TextStyle(
    fontFamily: 'Figtree',
    fontSize: 28,
    height: 1.12,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.5,
  );
  static const heading = TextStyle(
    fontFamily: 'Figtree',
    fontSize: 20,
    height: 1.25,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
  );
  static const body = TextStyle(fontFamily: 'Figtree', fontSize: 16, height: 1.45);
  static const small = TextStyle(fontFamily: 'Figtree', fontSize: 13, height: 1.4, color: Palette.ink2);
  static const figure = TextStyle(
    fontFamily: 'Figtree',
    fontSize: 28,
    height: 1.05,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.5,
    fontFeatures: [FontFeature.tabularFigures()],
  );
}

/// Page « banderole et feuille » : la banderole à la couleur du parti porte le message de l'écran en grand ;
/// la feuille papier monte par-dessus, arrondie en haut. `object` (la carte de membre) se pose à cheval sur les
/// deux plans. Seul écran de l'app où le parti s'affiche en aplat.
class BannerPage extends StatelessWidget {
  const BannerPage({
    super.key,
    required this.brand,
    required this.title,
    this.message,
    this.leading,
    this.object,
    this.objectAspect = 1.586,
    this.objectScale = 1,
    this.sheetColor = Palette.paper,
    required this.children,
  });

  /// Couleur de la feuille : papier, ou liège du tableau d'affichage (Actualités).
  final Color sheetColor;

  final Color brand;
  final String title;
  final String? message;

  /// Au-dessus du titre, dans la banderole (photo du membre sur l'onglet Moi).
  final Widget? leading;

  /// Objet à cheval sur la banderole et la feuille.
  final Widget? object;
  final double objectAspect;

  /// Part de la largeur utile occupée par l'objet, centré (la carte de l'Accueil reste compacte).
  final double objectScale;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final on = onColor(brand);
    final top = MediaQuery.paddingOf(context).top;
    return ColoredBox(
      color: brand,
      child: LayoutBuilder(
        builder: (context, box) {
          final objectW = (box.maxWidth - 2 * Space.gutter) * objectScale;
          final objectH = object == null ? 0.0 : objectW / objectAspect;
          final half = objectH / 2;
          return ListView(
            padding: EdgeInsets.zero,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(Space.gutter, top + Space.l, Space.gutter, half + Space.xl + 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (leading != null) ...[leading!, const SizedBox(height: Space.m)],
                    Text(title, style: Txt.display.copyWith(color: on)),
                    if (message != null) ...[
                      const SizedBox(height: Space.s),
                      Text(
                        message!,
                        style: Txt.heading.copyWith(color: on.withValues(alpha: 0.86), fontWeight: FontWeight.w500),
                      ),
                    ],
                  ],
                ),
              ),
              // La feuille monte de 28 px (et de la moitié de l'objet) sur la banderole.
              Transform.translate(
                offset: Offset(0, -(half + 28)),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      margin: EdgeInsets.only(top: half),
                      padding: EdgeInsets.fromLTRB(Space.gutter, half + Space.l, Space.gutter, 140),
                      decoration: BoxDecoration(
                        color: sheetColor,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                      ),
                      constraints: BoxConstraints(minHeight: MediaQuery.sizeOf(context).height),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
                    ),
                    if (object != null)
                      Positioned(left: (box.maxWidth - objectW) / 2, width: objectW, top: 0, child: object!),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Une action ou une entrée : titre en 18, précision dessous, état à droite (en couleur seulement s'il faut agir).
/// Pas de cadre ni de filet : l'espace sépare les lignes.
class ActionRow extends StatelessWidget {
  const ActionRow({super.key, required this.title, this.detail, this.icon, this.state, this.stateColor, this.onTap});

  final String title;
  final String? detail;
  final IconData? icon;
  final String? state;
  final Color? stateColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = Theme.of(context).colorScheme.primary;
    return Semantics(
      button: onTap != null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            children: [
              if (icon != null) ...[
                ExcludeSemantics(child: Icon(icon, size: 26, color: brand)),
                const SizedBox(width: Space.m),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Txt.heading.copyWith(fontSize: 18)),
                    if (detail != null && detail!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(detail!, style: Txt.small.copyWith(fontSize: 14)),
                    ],
                  ],
                ),
              ),
              if (state != null) ...[
                const SizedBox(width: Space.s),
                Text(
                  state!,
                  style: Txt.small.copyWith(
                    fontSize: 14,
                    color: stateColor ?? Palette.ink2,
                    fontWeight: stateColor == null ? FontWeight.w400 : FontWeight.w600,
                  ),
                ),
              ],
              if (onTap != null) ...[
                const SizedBox(width: Space.xs),
                const ExcludeSemantics(child: Icon(Icons.chevron_right, color: Palette.ink2)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Titre de partie dans la feuille : 20, avec de l'air au-dessus.
class SheetHeading extends StatelessWidget {
  const SheetHeading(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Space.xl, bottom: Space.s),
    child: Row(
      children: [
        Expanded(child: Text(text, style: Txt.heading)),
        ?trailing,
      ],
    ),
  );
}

/// Chiffre clé : la valeur en grand, son nom dessous.
class Figure extends StatelessWidget {
  const Figure({super.key, required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '$value $label',
    excludeSemantics: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: Txt.figure),
        const SizedBox(height: 2),
        Text(label, style: Txt.small),
      ],
    ),
  );
}

/// Couleur du parti lisible sur la barre encre : éclaircie si elle est trop sombre.
Color brandOnInk(Color brand) {
  final hsl = HSLColor.fromColor(brand);
  return hsl.lightness < 0.55 ? hsl.withLightness(0.62).toColor() : brand;
}

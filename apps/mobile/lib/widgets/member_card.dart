import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/theme.dart';

/// Carte de membre (skill ui-design) : fond profond à la couleur du parti, motif de sécurité ondulé, numéro en
/// grand, légère inclinaison, et un reflet qui la traverse une fois à l'apparition (seul moment animé de l'accueil).
class MemberCard extends StatefulWidget {
  const MemberCard({
    super.key,
    required this.brand,
    required this.partyName,
    required this.name,
    required this.number,
    required this.memberLabel,
    this.location,
    this.since,
    this.badge,
    this.tilt = -0.035,
  });

  final Color brand;
  final String partyName;
  final String name;
  final String number;
  final String memberLabel;
  final String? location;
  final String? since;

  /// Pastille ambre (« 2026 réglée ») ; null si la cotisation n'est pas à jour.
  final String? badge;
  final double tilt;

  @override
  State<MemberCard> createState() => _MemberCardState();
}

class _MemberCardState extends State<MemberCard> with SingleTickerProviderStateMixin {
  late final AnimationController _sheen = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!MediaQuery.of(context).disableAnimations && !_sheen.isAnimating && _sheen.value == 0) {
      Future.delayed(const Duration(milliseconds: 350), () {
        if (mounted) _sheen.forward();
      });
    }
  }

  @override
  void dispose() {
    _sheen.dispose();
    super.dispose();
  }

  /// Teinte profonde dérivée de la couleur du parti : le pétrole devient pétrole profond, la prune une prune sombre.
  Color get _deep {
    final hsl = HSLColor.fromColor(widget.brand);
    return hsl.withLightness((hsl.lightness * 0.45).clamp(0.12, 0.26)).toColor();
  }

  @override
  Widget build(BuildContext context) {
    const fg = Palette.paper;
    final number = widget.number.replaceAllMapped(RegExp(r'^(\d{3})(\d{3})$'), (m) => '${m[1]} ${m[2]}');
    return Transform.rotate(
      angle: widget.tilt,
      child: AspectRatio(
        aspectRatio: 1.586,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: _deep),
              CustomPaint(painter: _GuillochePainter(color: widget.brand.withValues(alpha: 0.55))),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            widget.partyName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.figtree(color: fg, fontWeight: FontWeight.w600, fontSize: 15),
                          ),
                        ),
                        if (widget.badge != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: Palette.accent, borderRadius: BorderRadius.circular(20)),
                            child: Text(
                              widget.badge!,
                              style: GoogleFonts.figtree(color: Palette.ink, fontWeight: FontWeight.w600, fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      number,
                      style: GoogleFonts.figtree(
                        color: fg,
                        fontWeight: FontWeight.w600,
                        fontSize: 34,
                        letterSpacing: 2,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      widget.name,
                      style: GoogleFonts.figtree(color: fg, fontWeight: FontWeight.w600, fontSize: 17),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [widget.memberLabel, widget.location, widget.since].whereType<String>().join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.figtree(color: fg.withValues(alpha: 0.78), fontSize: 13),
                    ),
                  ],
                ),
              ),
              // Reflet métallisé : une bande claire qui traverse la carte en diagonale.
              AnimatedBuilder(
                animation: _sheen,
                builder: (_, _) => _sheen.value == 0 || _sheen.isCompleted
                    ? const SizedBox.shrink()
                    : FractionallySizedBox(
                        widthFactor: 0.35,
                        alignment: Alignment(-2.2 + 4.4 * Curves.easeInOut.transform(_sheen.value), 0),
                        child: Transform.rotate(
                          angle: 0.35,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: [
                                Colors.white.withValues(alpha: 0),
                                Colors.white.withValues(alpha: 0.18),
                                Colors.white.withValues(alpha: 0),
                              ]),
                            ),
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Motif de sécurité : des ondes fines et serrées, comme sur un billet de banque.
class _GuillochePainter extends CustomPainter {
  _GuillochePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.7;
    for (var i = 0; i < 16; i++) {
      final path = Path();
      final base = size.height * 0.15 + i * size.height * 0.055;
      for (double x = 0; x <= size.width; x += 4) {
        final y = base + math.sin(x / size.width * math.pi * 3 + i * 0.5) * 9 + math.sin(x / 23 + i) * 2;
        x == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(_GuillochePainter old) => old.color != color;
}

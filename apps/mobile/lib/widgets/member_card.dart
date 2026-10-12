import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/theme.dart';

/// Carte de membre : la même que sur le web (packages/ui MemberCard), objet signature du skill ui-design.
/// Fond à la couleur du parti (assombrie jusqu'à un contraste de 4,5:1 avec le texte crème), grand disque coupé
/// par le bord, rosette guillochée ton sur ton, filet intérieur, micro-texte au nom du parti, sceau des initiales,
/// pastille de l'année, numéro frappé, QR de vérification facultatif. Un reflet passe une fois à l'apparition.
class MemberCard extends StatefulWidget {
  const MemberCard({
    super.key,
    required this.brand,
    required this.partyName,
    required this.name,
    required this.number,
    required this.numberLabel,
    this.location,
    this.year,
    this.secondary,
    this.verifyUrl,
    this.tilt = -0.044,
    this.style,
    this.photoUrl,
    this.details = const [],
  });

  final Color brand;
  final Color? secondary;
  final String partyName;
  final String name;
  final String number;
  final String numberLabel;
  final String? location;
  final String? year;
  final String? verifyUrl;
  final double tilt;

  /// Modèle de carte réglé par l'organisation dans le back-office (ADH-13) ; dessin par défaut s'il manque.
  final CardStyle? style;
  final String? photoUrl;

  /// Lignes sous le nom : statut, ancienneté, si le modèle les imprime.
  final List<String> details;

  @override
  State<MemberCard> createState() => _MemberCardState();
}

/// Modèle de carte de l'organisation, lu de /members/me/card-design (même schéma que packages/shared/src/card.ts).
/// La carte de l'application reste au format carte : le badge vertical et le verso ne servent qu'à l'impression.
class CardStyle {
  const CardStyle({
    this.background,
    this.backgroundUrl,
    this.veil = 0.35,
    this.text,
    this.accent,
    this.pattern = 'rosette',
    this.logoUrl,
    this.title,
    this.fields = const {},
    this.validityMode = 'year',
    this.validUntil,
  });

  final Color? background;
  final String? backgroundUrl;
  final double veil;
  final Color? text;
  final Color? accent;
  final String pattern;
  final String? logoUrl;
  final String? title;
  final Map<String, bool> fields;
  final String validityMode;
  final String? validUntil;

  bool show(String field) => fields[field] ?? field != 'status';

  static Color? _hex(Object? v) =>
      v is String && v.length == 7 ? Color(int.parse('FF${v.substring(1)}', radix: 16)) : null;

  static CardStyle fromJson(Map data, String lang) {
    final d = (data['design'] as Map?) ?? const {};
    final bg = (d['background'] as Map?) ?? const {};
    final assets = (data['assets'] as Map?) ?? const {};
    final party = (data['party'] as Map?) ?? const {};
    final title = d['title'] as Map?;
    final validity = (d['validity'] as Map?) ?? const {};
    return CardStyle(
      background: _hex(bg['color']),
      backgroundUrl: bg['kind'] == 'image' ? assets['backgroundUrl'] as String? : null,
      veil: (bg['veil'] as num?)?.toDouble() ?? 0.35,
      text: _hex(d['textColor']),
      accent: _hex(d['accentColor']),
      pattern: d['pattern'] as String? ?? 'rosette',
      logoUrl: d['showLogo'] == false ? null : party['logoUrl'] as String?,
      title: title == null ? null : ((lang == 'ht' ? title['ht'] : null) ?? title['fr']) as String?,
      fields: {for (final e in ((d['fields'] as Map?) ?? const {}).entries) e.key as String: e.value == true},
      validityMode: validity['mode'] as String? ?? 'year',
      validUntil: validity['until'] as String?,
    );
  }
}

const _cardText = Color(0xFFF6E7C8); // --c-card-cream
const _accentBright = Color(0xFFF2B84B);
const _onAccent = Color(0xFF2B1C03);

Color _mix(Color a, Color b, double t) => Color.lerp(a, b, t)!;

double _contrast(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// Fond, profondeur et texte de la carte (cardBackground de packages/ui/src/theme.ts).
({Color background, Color depth, Color text, bool dark}) cardColors(Color brand) {
  var bg = brand;
  if (_contrast(bg, _cardText) < 4.5 && _contrast(bg, Palette.ink) >= 4.5) {
    return (background: bg, depth: _mix(bg, Colors.black, 0.18), text: Palette.ink, dark: false);
  }
  for (var i = 0; _contrast(bg, _cardText) < 4.5 && i < 30; i++) {
    bg = _mix(bg, Colors.black, 0.05);
  }
  return (background: bg, depth: _mix(bg, Colors.black, 0.3), text: _cardText, dark: true);
}

class _MemberCardState extends State<MemberCard> with SingleTickerProviderStateMixin {
  late final AnimationController _shine = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started && !MediaQuery.of(context).disableAnimations) {
      _started = true;
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) _shine.forward();
      });
    }
  }

  @override
  void dispose() {
    _shine.dispose();
    super.dispose();
  }

  String get _initials => widget.partyName
      .split(RegExp(r'\s+'))
      .where((w) => w.length > 2 || RegExp(r'^[A-Z]').hasMatch(w))
      .take(3)
      .map((w) => w[0].toUpperCase())
      .join();

  @override
  Widget build(BuildContext context) {
    final st = widget.style;
    final c = cardColors(st?.background ?? widget.brand);
    final text = st?.text ?? c.text;
    // Validité : année réglée (cotisation à jour), date fixe, ou rien, selon le modèle.
    final year = st == null || st.validityMode == 'year'
        ? (st?.show('validity') == false ? null : widget.year)
        : st.validityMode == 'until' && st.show('validity') && st.validUntil != null
        ? st.validUntil!.split('-').reversed.join('/')
        : null;
    final pill = st?.accent ?? widget.secondary ?? _accentBright;
    final onPill = st?.accent != null
        ? onColor(st!.accent!)
        : widget.secondary != null
        ? onColor(widget.secondary!)
        : _onAccent;
    final image = st?.backgroundUrl;
    final pattern = st?.pattern ?? 'rosette';
    return Transform.rotate(
      angle: widget.tilt,
      child: AspectRatio(
        aspectRatio: 1.586,
        child: Container(
          decoration: BoxDecoration(
            color: c.background,
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 24, offset: Offset(0, 12))],
          ),
          clipBehavior: Clip.antiAlias,
          child: LayoutBuilder(
            builder: (context, box) {
              final w = box.maxWidth, h = box.maxHeight;
              return Stack(
                children: [
                  // Image de fond du modèle, voilée pour garder le texte lisible ; couleur seule hors ligne.
                  if (image != null) ...[
                    Positioned.fill(
                      child: Image.network(
                        image,
                        fit: BoxFit.cover,
                        cacheWidth: 1012,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                    Positioned.fill(
                      child: ColoredBox(color: c.background.withValues(alpha: st!.veil)),
                    ),
                  ],
                  // Grand disque, coupé par le bord : la seconde couleur du parti, sinon sa couleur plus profonde.
                  Positioned(
                    right: -0.28 * w,
                    bottom: -0.55 * h,
                    width: 0.95 * w,
                    height: 0.95 * w,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: (widget.secondary ?? c.depth).withValues(alpha: widget.secondary != null ? 0.35 : 0.4),
                      ),
                    ),
                  ),
                  // Motif de sécurité : rosette guillochée (hypotrochoïdes, le motif des billets) ou ondes.
                  if (pattern == 'rosette')
                    Positioned(
                      right: -0.24 * w,
                      bottom: -0.46 * h,
                      width: 0.88 * w,
                      height: 0.88 * w,
                      child: Opacity(opacity: 0.32, child: CustomPaint(painter: _RosettePainter(text))),
                    )
                  else if (pattern == 'waves')
                    Positioned.fill(
                      child: Opacity(opacity: 0.22, child: CustomPaint(painter: _WavesPainter(text))),
                    ),
                  // Filet intérieur.
                  Positioned.fill(
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: text.withValues(alpha: 0.28), width: 0.5),
                        ),
                      ),
                    ),
                  ),
                  // Micro-texte au nom du parti, le long du bord inférieur.
                  Positioned(
                    left: 14,
                    right: 14,
                    bottom: 9,
                    child: Text(
                      List.filled(14, widget.partyName).join('  '),
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      softWrap: false,
                      style: TextStyle(
                        fontFamily: 'Figtree',
                        fontSize: 4.5,
                        letterSpacing: 0.4,
                        fontWeight: FontWeight.w500,
                        color: text.withValues(alpha: 0.4),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 20, 22, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (st?.logoUrl != null)
                              ClipOval(
                                child: Image.network(
                                  st!.logoUrl!,
                                  width: 38,
                                  height: 38,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      _Seal(initials: _initials.isEmpty ? '•' : _initials, color: text),
                                ),
                              )
                            else
                              _Seal(initials: _initials.isEmpty ? '•' : _initials, color: text),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                widget.partyName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontFamily: 'Figtree',
                                  color: text,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 16,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ),
                            if (year != null)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                                decoration: BoxDecoration(color: pill, borderRadius: BorderRadius.circular(20)),
                                child: Text(
                                  year,
                                  style: TextStyle(
                                    fontFamily: 'Figtree',
                                    color: onPill,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                    fontFeatures: const [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const Spacer(),
                        if (st?.show('number') != false) ...[
                          Text(
                            st?.title ?? widget.numberLabel,
                            style: TextStyle(
                              fontFamily: 'Figtree',
                              color: text.withValues(alpha: 0.72),
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 2),
                          // Numéro frappé : ombre sombre dessous, lumière dessus (inversé sur un fond clair).
                          Text(
                            widget.number,
                            style: TextStyle(
                              fontFamily: 'Figtree',
                              color: text,
                              fontWeight: FontWeight.w600,
                              fontSize: (w * 0.105).clamp(26, 40),
                              height: 1.12,
                              letterSpacing: 1.4,
                              fontFeatures: const [FontFeature.tabularFigures()],
                              shadows: c.dark
                                  ? const [
                                      Shadow(color: Color(0x73000000), offset: Offset(0, 1)),
                                      Shadow(color: Color(0x24FFFFFF), offset: Offset(0, -1)),
                                    ]
                                  : const [
                                      Shadow(color: Color(0x80FFFFFF), offset: Offset(0, 1)),
                                      Shadow(color: Color(0x1F000000), offset: Offset(0, -1)),
                                    ],
                            ),
                          ),
                        ] else if (st?.title != null)
                          Text(
                            st!.title!,
                            style: TextStyle(
                              fontFamily: 'Figtree',
                              color: text,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        const Spacer(),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (widget.photoUrl != null && st?.show('photo') != false) ...[
                              ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Image.network(
                                  widget.photoUrl!,
                                  width: 0.13 * w,
                                  height: 0.16 * w,
                                  fit: BoxFit.cover,
                                  cacheWidth: 200,
                                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                                ),
                              ),
                              const SizedBox(width: 10),
                            ],
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    widget.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontFamily: 'Figtree',
                                      color: text,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 16,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                  if (widget.location != null && st?.show('zone') != false)
                                    Text(
                                      widget.location!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontFamily: 'Figtree',
                                        color: text.withValues(alpha: 0.78),
                                        fontSize: 12,
                                      ),
                                    ),
                                  if (widget.details.isNotEmpty)
                                    Text(
                                      widget.details.join(', '),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontFamily: 'Figtree',
                                        color: text.withValues(alpha: 0.78),
                                        fontSize: 11,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            if (widget.verifyUrl != null)
                              Container(
                                padding: const EdgeInsets.all(3),
                                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
                                child: QrImageView(data: widget.verifyUrl!, size: 58, padding: EdgeInsets.zero),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Reflet : une bande claire inclinée qui traverse la carte une fois.
                  AnimatedBuilder(
                    animation: _shine,
                    builder: (_, _) {
                      if (!_shine.isAnimating) return const SizedBox.shrink();
                      final x = -0.6 * w + Curves.easeOutCubic.transform(_shine.value) * 1.9 * w;
                      return Positioned(
                        left: x,
                        top: -0.4 * h,
                        bottom: -0.4 * h,
                        width: 0.38 * w,
                        child: Transform(
                          transform: Matrix4.skewX(-0.32),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Colors.white.withValues(alpha: 0),
                                  Colors.white.withValues(alpha: 0.24),
                                  Colors.white.withValues(alpha: 0),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Sceau : initiales du parti dans un double cercle.
class _Seal extends StatelessWidget {
  const _Seal({required this.initials, required this.color});
  final String initials;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 38,
    height: 38,
    padding: const EdgeInsets.all(2.5),
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(color: color, width: 0.5),
    ),
    child: Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 1.5),
      ),
      child: Text(
        initials,
        style: TextStyle(
          fontFamily: 'Figtree',
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 12,
          letterSpacing: 0.3,
        ),
      ),
    ),
  );
}

/// Trois hypotrochoïdes (mêmes paramètres que le web : R 100, r 36, d 62 et 44 ; R 90, r 30, d 30).
class _RosettePainter extends CustomPainter {
  _RosettePainter(this.color);
  final Color color;

  static Path _curve(double R, double r, double d, double scale, Offset c) {
    int gcd(int a, int b) => b == 0 ? a : gcd(b, a % b);
    final turns = r / gcd(R.round(), r.round());
    final p = Path();
    const steps = 900;
    for (var i = 0; i <= steps; i++) {
      final t = i / steps * 2 * math.pi * turns;
      final x = (R - r) * math.cos(t) + d * math.cos((R - r) / r * t);
      final y = (R - r) * math.sin(t) - d * math.sin((R - r) / r * t);
      final o = c + Offset(x, y) * scale;
      i == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
    }
    return p..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    // Même cadrage que la vue SVG du web (-170 à 170).
    final scale = size.width / 340;
    final center = size.center(Offset.zero);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(0.45 * scale, 0.5)
      ..color = color;
    canvas.drawPath(_curve(100, 36, 62, scale, center), stroke);
    canvas.drawPath(_curve(100, 36, 44, scale, center), stroke..color = color.withValues(alpha: 0.7));
    canvas.drawPath(_curve(90, 30, 30, scale, center), stroke..color = color.withValues(alpha: 0.5));
  }

  @override
  bool shouldRepaint(_RosettePainter old) => old.color != color;
}

/// Ondes de sécurité : 14 sinusoïdes décalées (mêmes paramètres que WAVES sur le web, cadre de 340 sur 214).
class _WavesPainter extends CustomPainter {
  _WavesPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 340, sy = size.height / 214;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.7
      ..color = color;
    for (var i = 0; i < 14; i++) {
      final p = Path();
      for (var x = 0.0; x <= 340; x += 6) {
        final y = 24 + i * 13 + math.sin(x / 340 * math.pi * 3 + i * 0.5) * 9;
        x == 0 ? p.moveTo(x * sx, y * sy) : p.lineTo(x * sx, y * sy);
      }
      canvas.drawPath(p, stroke);
    }
  }

  @override
  bool shouldRepaint(_WavesPainter old) => old.color != color;
}

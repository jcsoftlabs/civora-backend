import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Couleurs de docs/design/tokens.css. La couleur du parti remplace le pétrole dans son espace.
abstract final class Palette {
  static const primary = Color(0xFF0F6E66);
  static const primaryDeep = Color(0xFF0B3B37);
  static const rail = Color(0xFF12211F);
  static const accent = Color(0xFFE0A33B);
  static const ink = Color(0xFF1C1B19);
  static const ink2 = Color(0xFF6B6862);
  static const paper = Color(0xFFF3F0EA);
  static const board = Color(0xFFEDE6D8);
  static const cream = Color(0xFFFBF6EC);
  static const surface = Color(0xFFFFFFFF);
  static const line = Color(0xFFE4DFD6);
  static const success = Color(0xFF2E8B57);
  static const warning = Color(0xFFC98A12);
  static const danger = Color(0xFFC2412D);
  static const stamp = Color(0xFFC2412D);
  static const inkBlue = Color(0xFF1E3FA8);
}

Color parseHex(String? hex, [Color fallback = Palette.primary]) {
  final m = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(hex ?? '');
  return m == null ? fallback : Color(int.parse('FF${m.group(1)}', radix: 16));
}

double _contrast(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

/// Texte posé sur la couleur du parti : blanc ou encre, celui qui contraste le plus (4,5:1 visé).
Color onColor(Color c) => _contrast(c, Colors.white) >= _contrast(c, Palette.ink) ? Colors.white : Palette.ink;

ThemeData buildTheme(Color brand) {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
  final text = GoogleFonts.figtreeTextTheme(base.textTheme).apply(bodyColor: Palette.ink, displayColor: Palette.ink);
  return base.copyWith(
    scaffoldBackgroundColor: Palette.paper,
    colorScheme: ColorScheme.fromSeed(seedColor: brand).copyWith(
      primary: brand,
      onPrimary: onColor(brand),
      surface: Palette.surface,
      onSurface: Palette.ink,
      error: Palette.danger,
    ),
    textTheme: text.copyWith(
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.4, height: 1.1),
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.3, height: 1.15),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.2),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      bodyMedium: text.bodyMedium?.copyWith(height: 1.45),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: const StadiumBorder(),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: const StadiumBorder(),
        foregroundColor: Palette.ink,
        side: const BorderSide(color: Palette.ink),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(44, 44),
        foregroundColor: Palette.ink,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Palette.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Palette.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: brand, width: 2),
      ),
    ),
  );
}

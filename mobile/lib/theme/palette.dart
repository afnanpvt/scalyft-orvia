import 'package:flutter/material.dart';

/// Orvia's palette, taken from the web dashboard (src/globals.css): near-black
/// ink on a cool paper, with emerald reserved for "this is working".
@immutable
class OrviaColors extends ThemeExtension<OrviaColors> {
  const OrviaColors({
    required this.paper,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.line,
    required this.good,
    required this.goodSoft,
    required this.goodInk,
    required this.warn,
    required this.warnSoft,
    required this.warnInk,
    required this.bad,
    required this.badSoft,
    required this.badInk,
  });

  final Color paper;
  final Color surface;
  final Color ink;
  final Color muted;
  final Color line;
  final Color good;
  final Color goodSoft;
  final Color goodInk;
  final Color warn;
  final Color warnSoft;
  final Color warnInk;
  final Color bad;
  final Color badSoft;
  final Color badInk;

  static const light = OrviaColors(
    paper: Color(0xFFF5F5F7),
    surface: Color(0xFFFFFFFF),
    ink: Color(0xFF0A0A0B),
    muted: Color(0xFF6B6B72),
    line: Color(0xFFE3E3E8),
    good: Color(0xFF10B981),
    goodSoft: Color(0xFFD9F5E9),
    goodInk: Color(0xFF065F46),
    warn: Color(0xFFD97706),
    warnSoft: Color(0xFFFDF0D5),
    warnInk: Color(0xFF8A4B05),
    bad: Color(0xFFE5484D),
    badSoft: Color(0xFFFCE4E5),
    badInk: Color(0xFF9B1C21),
  );

  static const dark = OrviaColors(
    paper: Color(0xFF0C0C0E),
    surface: Color(0xFF1C1C1F),
    ink: Color(0xFFEBEBF0),
    muted: Color(0xFF9A9AA2),
    line: Color(0xFF2C2C31),
    good: Color(0xFF34D399),
    goodSoft: Color(0xFF0E3326),
    goodInk: Color(0xFF86EFC4),
    warn: Color(0xFFFBBF24),
    warnSoft: Color(0xFF3A2A08),
    warnInk: Color(0xFFFCD679),
    bad: Color(0xFFFF6B6B),
    badSoft: Color(0xFF3C1618),
    badInk: Color(0xFFFFA3A3),
  );

  @override
  OrviaColors copyWith() => this;

  // Blends every colour, so switching between light and dark fades the whole
  // screen together instead of half of it jumping at the midpoint.
  @override
  OrviaColors lerp(OrviaColors? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return OrviaColors(
      paper: mix(paper, other.paper),
      surface: mix(surface, other.surface),
      ink: mix(ink, other.ink),
      muted: mix(muted, other.muted),
      line: mix(line, other.line),
      good: mix(good, other.good),
      goodSoft: mix(goodSoft, other.goodSoft),
      goodInk: mix(goodInk, other.goodInk),
      warn: mix(warn, other.warn),
      warnSoft: mix(warnSoft, other.warnSoft),
      warnInk: mix(warnInk, other.warnInk),
      bad: mix(bad, other.bad),
      badSoft: mix(badSoft, other.badSoft),
      badInk: mix(badInk, other.badInk),
    );
  }
}

extension OrviaTheme on BuildContext {
  OrviaColors get c => Theme.of(this).extension<OrviaColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
}

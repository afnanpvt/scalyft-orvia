import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/theme/palette.dart';

void main() {
  test('switching themes blends every colour instead of jumping', () {
    const a = OrviaColors.light;
    const b = OrviaColors.dark;
    expect(a.lerp(b, 0).paper, a.paper);
    expect(a.lerp(b, 1).paper, b.paper);

    final mid = a.lerp(b, 0.5);
    for (final (got, from, to) in [
      (mid.paper, a.paper, b.paper),
      (mid.ink, a.ink, b.ink),
      (mid.surface, a.surface, b.surface),
      (mid.goodSoft, a.goodSoft, b.goodSoft),
    ]) {
      expect(got, Color.lerp(from, to, 0.5));
      expect(got, isNot(from));
      expect(got, isNot(to));
    }
  });
}

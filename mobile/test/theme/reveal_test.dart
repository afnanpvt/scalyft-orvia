import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/platform/appearance.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('the new theme is revealed over a picture of the old one, which then goes away', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final appearance = AppearanceController(await SharedPreferences.getInstance());
    final reveal = GlobalKey<ThemeRevealState>();

    await tester.pumpWidget(
      ListenableBuilder(
        listenable: appearance,
        builder: (_, _) => MaterialApp(
          theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: appearance.value.mode,
          themeAnimationDuration: appearance.transition,
          builder: (_, child) => ThemeReveal(key: reveal, child: child!),
          home: const Scaffold(body: Text('hello')),
        ),
      ),
    );

    // toImage only completes outside the test's fake clock.
    await tester.runAsync(() async {
      final change = reveal.currentState!.change(appearance, Appearance.dark, origin: const Offset(100, 100));
      await tester.pump();
      await change;
    });
    await tester.pump();

    expect(appearance.value, Appearance.dark);
    expect(appearance.transition, Duration.zero, reason: 'the reveal animates, not a colour blend');
    expect(find.byType(RawImage), findsOneWidget);
    expect(Theme.of(tester.element(find.text('hello'))).brightness, Brightness.dark, reason: 'switched at once underneath');

    await tester.pumpAndSettle();
    expect(find.byType(RawImage), findsNothing);
    expect(appearance.transition, AppearanceController.blend);
  });

  testWidgets('a change that looks the same, like System while the phone is light, just switches', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final appearance = AppearanceController(await SharedPreferences.getInstance());
    final reveal = GlobalKey<ThemeRevealState>();
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

    await tester.pumpWidget(MaterialApp(
      builder: (_, child) => ThemeReveal(key: reveal, child: child!),
      home: const SizedBox(),
    ));
    await reveal.currentState!.change(appearance, Appearance.system, origin: Offset.zero);
    await tester.pump();
    expect(appearance.value, Appearance.system);
    expect(find.byType(RawImage), findsNothing);
  });
}

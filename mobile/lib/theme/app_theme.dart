import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'palette.dart';

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final c = dark ? OrviaColors.dark : OrviaColors.light;

  // Explicit scheme (not fromSeed): the seed generator tints surfaces pink.
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.ink,
    onPrimary: c.paper,
    secondary: c.good,
    onSecondary: dark ? const Color(0xFF04140D) : Colors.white,
    surface: c.paper,
    onSurface: c.ink,
    onSurfaceVariant: c.muted,
    surfaceContainerLowest: c.surface,
    surfaceContainerLow: c.surface,
    surfaceContainer: c.surface,
    surfaceContainerHigh: c.surface,
    surfaceContainerHighest: c.surface,
    outline: c.line,
    outlineVariant: c.line,
    error: c.bad,
    onError: Colors.white,
    errorContainer: c.badSoft,
    onErrorContainer: c.badInk,
  );

  TextStyle t(double size, FontWeight w, {double? h, double? ls, Color? color}) => TextStyle(
        fontFamily: 'Geist',
        fontSize: size,
        fontWeight: w,
        height: h,
        letterSpacing: ls,
        color: color ?? c.ink,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  final textTheme = TextTheme(
    displayLarge: t(56, FontWeight.w600, h: 1.0, ls: -2.4),
    displayMedium: t(40, FontWeight.w600, h: 1.05, ls: -1.6),
    headlineMedium: t(26, FontWeight.w600, h: 1.2, ls: -0.6),
    headlineSmall: t(22, FontWeight.w600, h: 1.25, ls: -0.4),
    titleLarge: t(19, FontWeight.w600, h: 1.3, ls: -0.2),
    titleMedium: t(16, FontWeight.w600, h: 1.35),
    titleSmall: t(14, FontWeight.w600, h: 1.35),
    bodyLarge: t(16, FontWeight.w400, h: 1.5),
    bodyMedium: t(14.5, FontWeight.w400, h: 1.5),
    bodySmall: t(12.5, FontWeight.w400, h: 1.45, color: c.muted),
    labelLarge: t(15, FontWeight.w600, h: 1.2),
    labelMedium: t(13, FontWeight.w500, h: 1.2),
    labelSmall: t(12, FontWeight.w500, h: 1.2, color: c.muted),
  );

  OutlineInputBorder border(Color color, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: w),
      );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: 'Geist',
    colorScheme: scheme,
    scaffoldBackgroundColor: c.paper,
    canvasColor: c.paper,
    dividerColor: c.line,
    textTheme: textTheme,
    extensions: [c],
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: c.paper,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge,
      foregroundColor: c.ink,
      systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: border(c.line),
      enabledBorder: border(c.line),
      focusedBorder: border(c.ink, 1.5),
      errorBorder: border(c.bad),
      focusedErrorBorder: border(c.bad, 1.5),
      labelStyle: textTheme.bodyMedium?.copyWith(color: c.muted),
      hintStyle: textTheme.bodyMedium?.copyWith(color: c.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.ink,
        foregroundColor: c.paper,
        disabledBackgroundColor: c.line,
        disabledForegroundColor: c.muted,
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: textTheme.labelLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        minimumSize: const Size.fromHeight(50),
        side: BorderSide(color: c.line, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: textTheme.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.ink,
        minimumSize: const Size(48, 48),
        textStyle: textTheme.labelLarge,
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: c.ink,
      side: BorderSide(color: c.line),
      shape: const StadiumBorder(),
      labelStyle: textTheme.labelMedium,
      secondaryLabelStyle: textTheme.labelMedium?.copyWith(color: c.paper),
      checkmarkColor: c.paper,
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: 6),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: c.ink.withValues(alpha: 0.08),
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => textTheme.labelSmall?.copyWith(
          color: s.contains(WidgetState.selected) ? c.ink : c.muted,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? c.ink : c.muted, size: 24),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.ink,
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: c.paper),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.paper : c.muted),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.ink : c.line),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.ink, linearTrackColor: c.line),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
    }),
  );
}

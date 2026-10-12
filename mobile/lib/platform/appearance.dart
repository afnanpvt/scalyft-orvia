import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum Appearance {
  light('Light', ThemeMode.light),
  dark('Dark', ThemeMode.dark),
  system('System', ThemeMode.system);

  const Appearance(this.label, this.mode);

  final String label;
  final ThemeMode mode;

  Brightness resolve(Brightness platform) => switch (this) {
    Appearance.light => Brightness.light,
    Appearance.dark => Brightness.dark,
    Appearance.system => platform,
  };
}

/// Light or dark. Kept on this phone rather than in the account, so the
/// sign-in screen already looks the way the owner chose. Light by default,
/// like the web dashboard.
class AppearanceController extends ChangeNotifier {
  AppearanceController(this._prefs);

  static const _key = 'appearance.v1';
  static const fallback = Appearance.light;

  /// How long the colours take to blend when nothing else animates the
  /// change, for example when the phone itself switches to dark at night.
  static const blend = Duration(milliseconds: 420);

  final SharedPreferences _prefs;
  bool _instant = false;

  Appearance get value => Appearance.values.asNameMap()[_prefs.getString(_key)] ?? fallback;

  /// [blend], or zero while a [ThemeReveal] is doing the animating.
  Duration get transition => _instant ? Duration.zero : blend;

  Future<void> set(Appearance a, {bool instant = false}) async {
    if (a == value) return;
    _instant = instant;
    await _prefs.setString(_key, a.name);
    notifyListeners();
  }

  void _endInstant() => _instant = false;
}

/// Changes the theme with a circle that grows from where the owner tapped,
/// showing the new look over a still picture of the old one. A plain colour
/// blend passes through a muddy grey halfway between light and dark; this
/// never shows a mixed frame.
class ThemeReveal extends StatefulWidget {
  const ThemeReveal({super.key, required this.child});

  final Widget child;

  static ThemeRevealState of(BuildContext context) => context.findAncestorStateOfType<ThemeRevealState>()!;

  @override
  State<ThemeReveal> createState() => ThemeRevealState();
}

class ThemeRevealState extends State<ThemeReveal> with SingleTickerProviderStateMixin {
  static const _duration = Duration(milliseconds: 560);

  final _boundary = GlobalKey();
  late final AnimationController _progress = AnimationController(vsync: this, duration: _duration)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) _clear();
    });
  late final Animation<double> _eased = CurvedAnimation(parent: _progress, curve: Curves.easeInOutCubic);

  ui.Image? _old;
  Offset _origin = Offset.zero;
  AppearanceController? _revealing;
  Brightness _oldBrightness = Brightness.light;

  /// Switches [controller] to [next], revealing it from [origin] (a global
  /// position, usually the tap).
  Future<void> change(AppearanceController controller, Appearance next, {required Offset origin}) async {
    if (next == controller.value) return;
    final platform = MediaQuery.platformBrightnessOf(context);
    final visibleChange = next.resolve(platform) != controller.value.resolve(platform);
    if (!visibleChange || MediaQuery.disableAnimationsOf(context) || _progress.isAnimating) {
      return controller.set(next);
    }

    final image = await _snapshot();
    if (!mounted) return;
    if (image == null) return controller.set(next);

    setState(() {
      _old?.dispose();
      _old = image;
      _origin = origin;
      _oldBrightness = controller.value.resolve(platform);
    });
    _revealing = controller;
    await controller.set(next, instant: true);
    unawaited(_progress.forward(from: 0));
  }

  /// A picture of the app as it looks now, or null if one cannot be taken
  /// quickly (then the change simply blends).
  Future<ui.Image?> _snapshot() async {
    try {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return null;
      final boundary = _boundary.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) return null;
      return await boundary
          .toImage(pixelRatio: MediaQuery.devicePixelRatioOf(context))
          .timeout(const Duration(milliseconds: 250));
    } catch (_) {
      return null;
    }
  }

  void _clear() {
    _revealing?._endInstant();
    _revealing = null;
    if (!mounted) return;
    setState(() {
      _old?.dispose();
      _old = null;
    });
  }

  @override
  void dispose() {
    _progress.dispose();
    _old?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final old = _old;
    return Stack(
      textDirection: TextDirection.ltr,
      children: [
        RepaintBoundary(key: _boundary, child: widget.child),
        if (old != null)
          Positioned.fill(
            // The status bar keeps matching the old picture until it is gone.
            child: AnnotatedRegion<SystemUiOverlayStyle>(
              value: _oldBrightness == Brightness.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
              // Taps wait until the new look is fully in place.
              child: AbsorbPointer(
                child: AnimatedBuilder(
                  animation: _eased,
                  builder: (context, _) => ClipPath(
                    clipper: _Hole(center: _origin, progress: _eased.value),
                    child: RawImage(image: old, fit: BoxFit.fill),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Everything except a circle around [center]; the circle grows until it
/// reaches the farthest corner.
class _Hole extends CustomClipper<Path> {
  const _Hole({required this.center, required this.progress});

  final Offset center;
  final double progress;

  @override
  Path getClip(Size size) {
    final reach = [
      Offset.zero,
      Offset(size.width, 0),
      Offset(0, size.height),
      Offset(size.width, size.height),
    ].map((corner) => (corner - center).distance).reduce(math.max);
    return Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addOval(Rect.fromCircle(center: center, radius: reach * progress));
  }

  @override
  bool shouldReclip(_Hole old) => old.progress != progress || old.center != center;
}

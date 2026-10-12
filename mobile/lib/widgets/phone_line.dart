import 'package:flutter/material.dart';

import '../theme/palette.dart';

enum LineState {
  /// Forwarding is on and Orvia can answer.
  covering,

  /// A call is being answered right now.
  live,

  /// Turned off on purpose: calls ring normally.
  paused,

  /// Never set up, or Orvia has no number yet.
  notSetUp,

  /// Forwarding is on but the account cannot answer (no minutes, inactive).
  blocked,
}

/// The one illustrative element in the app: the phone line between the
/// owner's phone and Orvia, drawn as it actually is. Solid and lit when calls
/// are covered, dashed when paused, broken when not connected.
class PhoneLine extends StatefulWidget {
  const PhoneLine({super.key, required this.state});

  final LineState state;

  @override
  State<PhoneLine> createState() => _PhoneLineState();
}

class _PhoneLineState extends State<PhoneLine> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(PhoneLine old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (widget.state == LineState.live && !reduce) {
      if (!_pulse.isAnimating) _pulse.repeat();
    } else {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final label = switch (widget.state) {
      LineState.covering => 'Phone line connected to Orvia',
      LineState.live => 'Orvia is on a call',
      LineState.paused => 'Phone line paused',
      LineState.notSetUp => 'Phone line not connected',
      LineState.blocked => 'Phone line connected but Orvia cannot answer',
    };
    return Semantics(
      label: label,
      image: true,
      child: ExcludeSemantics(
        child: SizedBox(
          height: 72,
          child: AnimatedBuilder(
            animation: _pulse,
            builder: (context, _) => CustomPaint(
              painter: _LinePainter(
                state: widget.state,
                t: _pulse.value,
                ink: c.ink,
                muted: c.muted,
                line: c.line,
                good: c.good,
                bad: c.bad,
                surface: c.surface,
              ),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.state,
    required this.t,
    required this.ink,
    required this.muted,
    required this.line,
    required this.good,
    required this.bad,
    required this.surface,
  });

  final LineState state;
  final double t;
  final Color ink;
  final Color muted;
  final Color line;
  final Color good;
  final Color bad;
  final Color surface;

  @override
  void paint(Canvas canvas, Size size) {
    const r = 22.0;
    final y = size.height / 2;
    final left = Offset(r + 2, y);
    final right = Offset(size.width - r - 2, y);

    final on = state == LineState.covering || state == LineState.live;
    final lineColor = switch (state) {
      LineState.covering || LineState.live => good,
      LineState.blocked => bad,
      LineState.paused || LineState.notSetUp => muted.withValues(alpha: 0.55),
    };

    final stroke = Paint()
      ..color = lineColor
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final from = left.dx + r + 6;
    final to = right.dx - r - 6;

    switch (state) {
      case LineState.covering:
      case LineState.live:
      case LineState.blocked:
        canvas.drawLine(Offset(from, y), Offset(to, y), stroke);
      case LineState.paused:
        _dashed(canvas, from, to, y, stroke, dash: 7, gap: 7);
      case LineState.notSetUp:
        // Two stubs with the middle missing: the line does not reach.
        final mid = (from + to) / 2;
        _dashed(canvas, from, mid - 26, y, stroke, dash: 7, gap: 7);
        _dashed(canvas, mid + 26, to, y, stroke, dash: 7, gap: 7);
    }

    if (state == LineState.live) {
      // A single pulse travelling toward Orvia while a call is answered.
      final x = from + (to - from) * Curves.easeInOut.transform(t);
      canvas.drawCircle(Offset(x, y), 9, Paint()..color = good.withValues(alpha: 0.18 * (1 - t)));
      canvas.drawCircle(Offset(x, y), 4.5, Paint()..color = good);
    }

    _node(canvas, left, r, filled: false, ring: ink, glyph: _Glyph.phone, glyphColor: ink);
    _node(
      canvas,
      right,
      r,
      filled: on,
      ring: on ? good : (state == LineState.blocked ? bad : muted.withValues(alpha: 0.55)),
      glyph: _Glyph.orvia,
      glyphColor: on ? surface : muted,
      glow: on ? good : null,
    );
  }

  void _dashed(Canvas canvas, double x1, double x2, double y, Paint p, {required double dash, required double gap}) {
    if (x2 <= x1) return;
    var x = x1;
    while (x < x2) {
      canvas.drawLine(Offset(x, y), Offset((x + dash).clamp(x1, x2), y), p);
      x += dash + gap;
    }
  }

  void _node(Canvas canvas, Offset c, double r, {required bool filled, required Color ring, required _Glyph glyph, required Color glyphColor, Color? glow}) {
    if (glow != null) {
      canvas.drawCircle(c, r + 7, Paint()..color = glow.withValues(alpha: 0.14));
    }
    canvas.drawCircle(c, r, Paint()..color = filled ? ring : surface);
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = ring
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    final g = Paint()
      ..color = glyphColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    switch (glyph) {
      case _Glyph.phone:
        // A handset: a rounded rectangle with a speaker slot.
        final rect = RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: 11, height: 18), const Radius.circular(3));
        canvas.drawRRect(rect, g);
        canvas.drawLine(c + const Offset(-2, -5.5), c + const Offset(2, -5.5), g);
      case _Glyph.orvia:
        // Sound bars: the receptionist.
        for (final (dx, h) in const [(-6.0, 5.0), (-2.0, 11.0), (2.0, 7.0), (6.0, 3.0)]) {
          canvas.drawLine(c + Offset(dx, -h / 2), c + Offset(dx, h / 2), g);
        }
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.state != state || old.t != t || old.ink != ink || old.good != good || old.muted != muted;
}

enum _Glyph { phone, orvia }
